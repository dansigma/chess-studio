import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { materialPhase } from "./phase.ts";

const fixtures: { fen: string; material: number }[] = JSON.parse(
  readFileSync(new URL("./fixtures/phase.json", import.meta.url), "utf8"),
);

test("Maia material phase agrees with the shared calibration fixtures", () => {
  for (const { fen, material } of fixtures) {
    assert.equal(materialPhase(fen), material / 62, fen);
  }
});
