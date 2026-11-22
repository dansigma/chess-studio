import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import { START_FEN } from "../chess/tree.ts";
import { indexCatalogOpenings, resolveLineOpening } from "./line-opening.ts";
import { loadCatalog } from "./openings-catalog.ts";

function lineFens(san: string): string[] {
  const chess = new Chess();
  return [chess.fen(), ...san.split(" ").map((move) => {
    chess.move(move);
    return chess.fen();
  })];
}

test("keeps the Rapport-Jobava System through 7. h3", async () => {
  const index = indexCatalogOpenings(await loadCatalog());
  const fens = lineFens("d4 d5 Nc3 Nf6 Bf4 e6 Nb5 Na6 e3 Be7 Nf3 O-O h3");
  for (let length = 6; length <= fens.length; length += 1) {
    assert.deepEqual(resolveLineOpening(fens.slice(0, length), index), {
      eco: "D01", name: "Rapport-Jobava System",
    });
  }
});

test("a deeper named opening overrides the earlier one", async () => {
  const index = indexCatalogOpenings(await loadCatalog());
  const fens = lineFens("e4 e5 Nf3 Nc6 Bc4 Bc5");
  assert.deepEqual(resolveLineOpening(fens.slice(0, -1), index), {
    eco: "C50", name: "Italian Game",
  });
  assert.deepEqual(resolveLineOpening(fens, index), {
    eco: "C50", name: "Italian Game: Giuoco Piano",
  });
});

test("finds a named opening reached by a transposition", async () => {
  const catalog = await loadCatalog();
  const fens = lineFens("e4 Nc6 Nf3 e5 Bc4 Bc5");
  assert.deepEqual(resolveLineOpening(fens, indexCatalogOpenings(catalog)), {
    eco: "C50", name: "Italian Game: Giuoco Piano",
  });
});

test("the starting position has no named opening", async () => {
  const index = indexCatalogOpenings(await loadCatalog());
  assert.equal(resolveLineOpening([START_FEN], index), null);
});
