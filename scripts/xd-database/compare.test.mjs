import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { otb, source } from "../opening-book/test-helpers.mjs";
import { buildDatabase } from "./build.mjs";
import { compareVersions } from "./compare.mjs";

function runCli(...args) {
  return spawnSync(process.execPath, [fileURLToPath(new URL("./compare.mjs", import.meta.url)), ...args], {
    encoding: "utf8",
  });
}

describe("xd-database compare", () => {
  let root;
  let oldDir;
  let newDir;
  let droppedDir;

  before(async () => {
    root = mkdtempSync(join(tmpdir(), "xd-compare-"));
    const main = ["1", "2", "3"].map((Round) => otb("e4 e5 Nf3 Nc6 Bb5 a6", { Round }));
    const side = ["4", "5"].map((Round) => otb("e4 e5 Nf3 Nc6 Bc4 Nf6", { Round }));
    const original = [...main, ...side];
    const added = otb("d4 d5 c4 e6", { Round: "6" });
    const options = { outDir: root, bucketBits: 2 };
    await buildDatabase([source(original.join(""))], { ...options, version: 1 });
    await buildDatabase([source([...original, added].join(""))], { ...options, version: 2 });
    await buildDatabase([source([...main.slice(0, 2), side[0]].join(""))], { ...options, version: 3 });
    [oldDir, newDir, droppedDir] = [1, 2, 3].map((version) => join(root, `v${version}`));
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it("reports deltas and passes when games are added", async () => {
    const result = await compareVersions(oldDir, newDir, { sample: 2 });
    assert.deepEqual(result.stats.gamesKept, { old: 5, new: 6, delta: 1 });
    assert.ok(result.files["games.bin"].delta > 0);
    assert.equal(result.sampledGames, 2);
    assert.ok(result.positionsChecked >= 5);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(await compareVersions(oldDir, newDir, { sample: 2 }), result);
    const cli = runCli(oldDir, newDir, "--sample", "2", "--json");
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), result);
  });

  it("checks opening totals even with game sampling disabled", async () => {
    const result = await compareVersions(oldDir, droppedDir, { sample: 0 });
    assert.equal(result.sampledGames, 0);
    assert.equal(result.positionsChecked, 5);
    assert.ok(result.errors.some((error) => error.startsWith("Position total decreased")));
    assert.ok(result.errors.every((error) => !error.startsWith("Position missing")));
  });

  it("fails on dropped games and detects missing deeper positions through replay", () => {
    const cli = runCli(oldDir, droppedDir, "--sample", "5", "--json");
    assert.equal(cli.status, 1, cli.stderr);
    const result = JSON.parse(cli.stdout);
    assert.equal(result.stats.gamesKept.delta, -2);
    assert.ok(result.errors.some((error) => error.startsWith("Games kept decreased")));
    assert.ok(result.errors.some((error) => error.startsWith("Position total decreased")));
    assert.ok(result.errors.some((error) => error.startsWith("Position missing in new tree")));
  });

  it("falls back to the game index for the regression check when stats are absent", async () => {
    const path = join(droppedDir, "manifest.json");
    const original = readFileSync(path, "utf8");
    const manifest = JSON.parse(original);
    delete manifest.stats;
    delete manifest.files;
    writeFileSync(path, JSON.stringify(manifest));
    try {
      const result = await compareVersions(oldDir, droppedDir, { sample: 0 });
      assert.deepEqual(result.stats.gamesKept, { old: 5, new: null, delta: null });
      assert.deepEqual(result.files["games.bin"], {
        old: JSON.parse(readFileSync(join(oldDir, "manifest.json"), "utf8")).files["games.bin"].bytes,
        new: null,
        delta: null,
      });
      assert.ok(result.errors.some((error) => error.startsWith("Games kept decreased")));
    } finally {
      writeFileSync(path, original);
    }
  });
});
