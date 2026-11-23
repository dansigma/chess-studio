// scripts/xd-database/position-key.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { bookKey } from "../../src/chess/opening-book.ts";
import { positionKeyBigInt } from "./position-key.mjs";

describe("positionKeyParts (32-bit FNV-1a 64)", () => {
  it("matches the app's bookKey on every position of real lines", () => {
    const lines = [
      "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5",
      "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5",
      "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6 d4 Nh5",
      "a4 h5 a5 b5 axb6 h4 g4 hxg3 bxc7 gxh2 cxd8=N hxg1=Q",
    ];
    let checked = 0;
    for (const line of lines) {
      const board = new Chess();
      for (const san of [...line.split(" "), null]) {
        assert.equal(positionKeyBigInt(board.fen()), bookKey(board.fen()), board.fen());
        checked += 1;
        if (san) {
          board.move(san);
        }
      }
    }
    assert.ok(checked > 60);
  });

  it("ignores the clock fields", () => {
    assert.equal(
      positionKeyBigInt("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"),
      positionKeyBigInt("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 7 42"),
    );
  });
});
