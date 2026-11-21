import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("builds a catalog with legal UCI moves and drops an illegal PGN row", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "openings-catalog-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const letter of "acde") {
    writeFileSync(join(directory, `${letter}.tsv`), "eco\tname\tpgn\n");
  }
  copyFileSync(new URL("./fixtures/b.tsv", import.meta.url), join(directory, "b.tsv"));
  const script = fileURLToPath(new URL("./build-catalog.mjs", import.meta.url));
  const output = join(directory, "catalog.json");
  const result = spawnSync(process.execPath, [script, directory, output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /b\.tsv:4: dropped row.*Invalid move/);
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), [
    { eco: "B20", name: "Sicilian Defense", uci: ["e2e4", "c7c5"] },
    {
      eco: "B90",
      name: "Sicilian Defense: Najdorf Variation",
      uci: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"],
    },
  ]);
});
