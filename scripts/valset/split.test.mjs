// SIG-1221: split determinism, stratification and the holdout lock.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { selectSplit } from "./run.mjs";
import { toJsonl } from "./schema.mjs";
import { applyLock, createLock, idsDigest, main, stratumOf } from "./split.mjs";

function synthetic(n) {
  const phases = ["opening", "middlegame", "endgame"];
  const bands = ["<1200", "1200-1599", "1600-1999", "2000+"];
  return Array.from({ length: n }, (_, i) => ({
    id: `item-${String(i).padStart(3, "0")}`,
    phase: phases[i % 3],
    tactical: i % 2 === 0,
    ratingBand: bands[i % 4],
  }));
}

describe("createLock", () => {
  const items = synthetic(120);

  it("is deterministic and independent of item order", () => {
    const a = createLock(items);
    const b = createLock([...items].reverse());
    assert.deepEqual(a.holdoutIds, b.holdoutIds);
    assert.deepEqual(createLock(items).holdoutIds, a.holdoutIds);
  });

  it("hits the requested holdout size and covers every stratum it can", () => {
    const lock = createLock(items, { fraction: 0.2 });
    assert.equal(lock.holdoutIds.length, 24);
    const byStratum = new Map();
    for (const item of items) byStratum.set(stratumOf(item), (byStratum.get(stratumOf(item)) ?? 0) + 1);
    for (const [key, { total, holdout }] of Object.entries(lock.strata)) {
      assert.equal(total, byStratum.get(key));
      assert.ok(Math.abs(holdout - total * 0.2) < 1, `${key}: ${holdout} of ${total}`);
    }
  });

  it("changes with the seed", () => {
    assert.notDeepEqual(createLock(items, { seed: "a" }).holdoutIds, createLock(items, { seed: "b" }).holdoutIds);
  });
});

describe("applyLock", () => {
  const items = synthetic(60);
  const lock = createLock(items);

  it("partitions into disjoint dev and holdout that cover everything", () => {
    const { dev, holdout, unseen } = applyLock(items, lock);
    assert.equal(dev.length + holdout.length, items.length);
    assert.equal(unseen, 0);
    assert.deepEqual(holdout.map((i) => i.id).sort(), lock.holdoutIds);
  });

  it("sends items the lock has never seen to dev, and fails when a locked id vanished", () => {
    const more = [...items, { ...items[0], id: "new-1" }];
    const applied = applyLock(more, lock);
    assert.ok(applied.dev.some((item) => item.id === "new-1"));
    assert.equal(applied.unseen > 0, true);
    assert.throws(() => applyLock(items.filter((item) => item.id !== lock.holdoutIds[0]), lock), /not in the items file/);
  });

  it("digest identifies the id set", () => {
    assert.equal(idsDigest(items), idsDigest([...items].reverse()));
    assert.notEqual(idsDigest(items), idsDigest(items.slice(1)));
  });
});

describe("split CLI and runner guards", () => {
  const dir = mkdtempSync(join(tmpdir(), "valset-split-"));
  const itemsPath = join(dir, "items.jsonl");
  const lockPath = join(dir, "holdout.lock.json");
  writeFileSync(itemsPath, toJsonl(synthetic(50).map((item) => ({ ...item }))));
  const quiet = (fn) => {
    const [log, error] = [console.log, console.error];
    console.log = console.error = () => {};
    try {
      return fn();
    } finally {
      [console.log, console.error] = [log, error];
    }
  };
  // The CLI validates items against the schema; use a real fixture-shaped file instead.
  it("refuses to re-split once the lock exists, and never rewrites it", async () => {
    const { fixtureItems } = await import("./test-helpers.mjs");
    const { items } = fixtureItems();
    writeFileSync(itemsPath, toJsonl(items));
    assert.equal(quiet(() => main([itemsPath, "--lock", lockPath, "--fraction", "0.25"])), 0);
    const first = readFileSync(lockPath, "utf8");
    assert.ok(JSON.parse(first).holdoutIds.length >= 4);
    assert.equal(quiet(() => main([itemsPath, "--lock", lockPath])), 0, "plain re-run only applies the lock");
    assert.equal(quiet(() => main([itemsPath, "--lock", lockPath, "--fraction", "0.5"])), 1, "a different fraction is refused");
    assert.equal(quiet(() => main([itemsPath, "--lock", lockPath, "--seed", "other"])), 1, "a different seed is refused");
    assert.equal(readFileSync(lockPath, "utf8"), first);
  });

  it("the runner needs --i-know for holdout and all, and a lock for holdout", () => {
    const items = synthetic(10);
    assert.throws(() => selectSplit(items, { split: "holdout", iKnow: false, lockPath }), /--i-know/);
    assert.throws(() => selectSplit(items, { split: "all", iKnow: false, lockPath }), /--i-know/);
    assert.throws(() => selectSplit(items, { split: "holdout", iKnow: true, lockPath: join(dir, "missing.json") }), /no holdout lock/);
    assert.throws(() => selectSplit(items, { split: "nonsense", iKnow: true, lockPath }), /--split must be/);
    const noLock = selectSplit(items, { split: "dev", iKnow: false, lockPath: join(dir, "missing.json") });
    assert.equal(noLock.items.length, 10);
    assert.match(noLock.note, /no holdout lock/);
    assert.equal(existsSync(lockPath), true);
  });

  it("dev excludes the locked holdout and holdout contains only it", async () => {
    const { fixtureItems } = await import("./test-helpers.mjs");
    const { items } = fixtureItems();
    const dev = selectSplit(items, { split: "dev", iKnow: false, lockPath }).items;
    const holdout = selectSplit(items, { split: "holdout", iKnow: true, lockPath }).items;
    assert.equal(dev.length + holdout.length, items.length);
    assert.ok(dev.every((item) => !holdout.some((h) => h.id === item.id)));
  });
});
