import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { openingAnchorKey } from "../line-opening";
import type { CatalogEntry } from "../openings-catalog";
import { loadLineOpeningCharacter } from "./opening-character";

test("opening anchor ignores en passant and move clocks while preserving castling rights", () => {
  const board = "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR";
  assert.equal(openingAnchorKey(`${board} w KQkq d6 0 3`), `${board} w KQkq`);
  assert.equal(openingAnchorKey(`${board} w KQkq - 1 3`), `${board} w KQkq`);
  assert.notEqual(openingAnchorKey(`${board} w kq - 1 3`), `${board} w KQkq`);
});

test("finds the deepest catalog opening and returns null when its profile is absent", async () => {
  const chess = new Chess("4k3/8/8/8/8/8/P7/4K3 w - - 0 1");
  const fens = ["a4", "Kd7", "a5"].map((move) => chess.move(move).after);
  const catalog: CatalogEntry[] = [
    { eco: "A00", name: "First anchor", fen: fens[0], side: "b", uci: ["a2a4"] },
    { eco: "A00", name: "Deepest anchor", fen: fens[1], side: "w", uci: ["a2a4", "e8d7"] },
  ];
  assert.deepEqual(await loadLineOpeningCharacter(fens, catalog), {
    opening: { eco: "A00", name: "Deepest anchor" }, character: null,
  });
  assert.deepEqual(await loadLineOpeningCharacter(fens, []), { opening: null, character: null });
});
