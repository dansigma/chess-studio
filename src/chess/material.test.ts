import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { materialBalance } from "./material.ts";

test("starting material is equal and nothing is missing", () => {
  assert.deepEqual(materialBalance(new Chess().fen()), {
    captured: { w: [], b: [] },
    difference: 0,
  });
});

test("a capture is attributed to the side that made it", () => {
  const chess = new Chess();
  chess.move("e4");
  chess.move("d5");
  chess.move("exd5");
  assert.deepEqual(materialBalance(chess.fen()), {
    captured: { w: [{ piece: "P", count: 1 }], b: [] },
    difference: 1,
  });
});

test("a visible promotion accounts for one missing pawn and adds material", () => {
  const fen = "rnbqkbnr/pppppppp/8/8/4Q3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
  assert.deepEqual(materialBalance(fen), {
    captured: { w: [], b: [] },
    difference: 8,
  });
});

test("setup positions group missing pieces and allow surplus material without negative captures", () => {
  const fen = "4k3/8/8/8/8/8/pppppppp/qqq1K3 w - - 0 1";
  assert.deepEqual(materialBalance(fen), {
    captured: {
      w: [{ piece: "R", count: 2 }, { piece: "B", count: 2 }, { piece: "N", count: 2 }],
      b: [
        { piece: "Q", count: 1 },
        { piece: "R", count: 2 },
        { piece: "B", count: 2 },
        { piece: "N", count: 2 },
        { piece: "P", count: 8 },
      ],
    },
    difference: -35,
  });
});
