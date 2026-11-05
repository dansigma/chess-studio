// SIG-1221: deterministic, stratified dev / holdout split with a lock file.
//
//   node --import ./scripts/test-resolve.mjs scripts/valset/split.mjs \
//        valset-data/items.truth.jsonl --lock valset-data/holdout.lock.json \
//        [--fraction 0.2] [--seed valset-1]
//
// Items are ordered inside each stratum (phase x tactical/positional x rating
// band) by sha256(seed:id), and the first share of each stratum goes to the
// holdout, so the result does not depend on file order. Rounding is done with
// largest remainders across strata so the holdout hits the requested fraction.
//
// The holdout ids are written to the lock file. Once the lock exists this module
// never re-splits: it only applies the lock. To really start over the lock file
// has to be deleted by hand.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { parseJsonl, validateItems } from "./schema.mjs";

export const DEFAULT_SEED = "valset-1";
export const DEFAULT_FRACTION = 0.2;

const sha = (text) => createHash("sha256").update(text).digest("hex");

export function stratumOf(item) {
  return `${item.phase}|${item.tactical ? "tactical" : "positional"}|${item.ratingBand}`;
}

export function idsDigest(items) {
  return sha(items.map((item) => item.id).sort().join("\n"));
}

export function createLock(items, { seed = DEFAULT_SEED, fraction = DEFAULT_FRACTION } = {}) {
  const strata = new Map();
  for (const item of items) {
    const key = stratumOf(item);
    if (!strata.has(key)) strata.set(key, []);
    strata.get(key).push(item);
  }
  const keys = [...strata.keys()].sort();
  const target = Math.round(items.length * fraction);
  const plan = keys.map((key) => {
    const exact = strata.get(key).length * fraction;
    return { key, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let missing = target - plan.reduce((sum, entry) => sum + entry.count, 0);
  for (const entry of [...plan].sort((a, b) => b.remainder - a.remainder || (a.key < b.key ? -1 : 1))) {
    if (missing <= 0) break;
    if (entry.count < strata.get(entry.key).length) {
      entry.count += 1;
      missing -= 1;
    }
  }
  const holdoutIds = [];
  const counts = {};
  for (const { key, count } of plan) {
    const ordered = [...strata.get(key)].sort((a, b) => {
      const ha = sha(`${seed}:${a.id}`);
      const hb = sha(`${seed}:${b.id}`);
      return ha < hb ? -1 : ha > hb ? 1 : 0;
    });
    holdoutIds.push(...ordered.slice(0, count).map((item) => item.id));
    counts[key] = { total: ordered.length, holdout: count };
  }
  return { version: 1, seed, fraction, itemCount: items.length, idsDigest: idsDigest(items), strata: counts, holdoutIds: holdoutIds.sort() };
}

export function loadLock(path) {
  const lock = JSON.parse(readFileSync(path, "utf8"));
  if (lock.version !== 1 || !Array.isArray(lock.holdoutIds)) {
    throw new Error(`${path} is not a valset holdout lock file`);
  }
  return lock;
}

/**
 * Partition items with an existing lock. Locked ids missing from `items` make the
 * partition fail (the set changed under the lock); items the lock has never seen
 * are placed in dev and reported in `unseen`.
 */
export function applyLock(items, lock) {
  const locked = new Set(lock.holdoutIds);
  const present = new Set(items.map((item) => item.id));
  const lost = lock.holdoutIds.filter((id) => !present.has(id));
  if (lost.length > 0) {
    throw new Error(`holdout lock lists ${lost.length} id(s) that are not in the items file (e.g. ${lost.slice(0, 3).join(", ")}); refusing to continue`);
  }
  return {
    dev: items.filter((item) => !locked.has(item.id)),
    holdout: items.filter((item) => locked.has(item.id)),
    unseen: lock.idsDigest === idsDigest(items) ? 0 : items.filter((item) => !locked.has(item.id)).length,
  };
}

export function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { lock: { type: "string", default: "valset-data/holdout.lock.json" }, fraction: { type: "string" }, seed: { type: "string" } },
  });
  if (positionals.length !== 1) {
    console.error("usage: split.mjs <items.jsonl> [--lock valset-data/holdout.lock.json] [--fraction 0.2] [--seed valset-1]");
    return 2;
  }
  const items = parseJsonl(readFileSync(positionals[0], "utf8"), positionals[0]);
  const check = validateItems(items);
  if (!check.ok) {
    console.error(check.errors.join("\n"));
    return 1;
  }
  if (existsSync(values.lock)) {
    const lock = loadLock(values.lock);
    if ((values.seed && values.seed !== lock.seed) || (values.fraction && Number(values.fraction) !== lock.fraction)) {
      console.error(`${values.lock} already exists with seed "${lock.seed}" and fraction ${lock.fraction}. The holdout is locked and is never re-split. Delete the lock file by hand only if you really mean to start over.`);
      return 1;
    }
    const applied = applyLock(items, lock);
    console.log(`lock exists (${values.lock}): not re-splitting. dev ${applied.dev.length}, holdout ${applied.holdout.length}${applied.unseen ? `, items file changed since locking (new items count as dev)` : ""}`);
    return 0;
  }
  const lock = createLock(items, { seed: values.seed ?? DEFAULT_SEED, fraction: values.fraction ? Number(values.fraction) : DEFAULT_FRACTION });
  mkdirSync(dirname(values.lock), { recursive: true });
  writeFileSync(values.lock, `${JSON.stringify(lock, null, 1)}\n`);
  console.log(`locked ${lock.holdoutIds.length} holdout ids of ${lock.itemCount} in ${values.lock} (seed "${lock.seed}", fraction ${lock.fraction})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
