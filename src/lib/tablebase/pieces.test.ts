import assert from "node:assert/strict";
import { test } from "node:test";
import { isTablebasePosition, pieceCount } from "./pieces";

for (const [board, count, eligible] of [
  ["4k3/8/8/8/8/8/8/4K3", 2, false],
  ["4k3/8/8/8/8/8/8/4K2R", 3, true],
  ["4k3/ppp5/8/8/8/8/PP6/4K3", 7, true],
  ["4k3/ppp5/8/8/8/8/PPP5/4K3", 8, false],
  ["invalid", null, false],
] as const) {
  test(`counts and checks eligibility for ${board}`, () => {
    const fen = `${board} w - - 0 1`;
    assert.equal(pieceCount(fen), count);
    assert.equal(isTablebasePosition(fen), eligible);
  });
}
