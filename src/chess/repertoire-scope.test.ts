import assert from "node:assert/strict";
import test from "node:test";
import { importPgn } from "./pgn";
import { getDueRepertoireMoves } from "./repertoire";
import { OTHER_LINES, repertoireCatalogIndex, repertoireVariations, scopeFilter } from "./repertoire-scope";
import { trainingAttempt } from "./training";
import { fenKey, getFenAt, START_FEN } from "./tree";
import type { CatalogEntry } from "../lib/openings-catalog";

test("names branches by their deepest catalog match, including transpositions and unmatched lines", () => {
  const { tree } = importPgn("1. Nf3 (1. g3 d5 2. Nf3 Nf6) (1. h4 h5) d5 2. g3 c5 *");
  const deepFen = getFenAt(tree, [0, 0, 0]);
  assert.equal(fenKey(deepFen), fenKey(getFenAt(tree, [1, 0, 0])));
  const catalog: CatalogEntry[] = [
    { eco: "A04", name: "Réti Opening", fen: getFenAt(tree, [0]), side: "b", uci: ["g1f3"] },
    { eco: "A07", name: "King's Indian Attack", fen: deepFen, side: "b", uci: ["g1f3", "d7d5", "g2g3"] },
  ];
  const variations = repertoireVariations(tree, catalog);
  assert.deepEqual(variations.map(({ id, name }) => [id, name]), [
    [fenKey(deepFen), "King's Indian Attack"],
    [OTHER_LINES, ""],
  ]);
  const named = scopeFilter(tree, { variationFen: fenKey(deepFen) });
  assert.deepEqual(getDueRepertoireMoves(tree, {}, "w", undefined, named).map(({ uci }) => uci),
    ["g1f3", "g2g3", "g2g3", "g1f3"]);
  const other = scopeFilter(tree, { variationFen: OTHER_LINES }, repertoireCatalogIndex(catalog));
  assert.deepEqual(getDueRepertoireMoves(tree, {}, "w", undefined, other).map(({ uci }) => uci), ["h2h4"]);
  assert.deepEqual(trainingAttempt(tree, [], "h2h4", named), { kind: "refused" });
  assert.deepEqual(trainingAttempt(tree, [], "g2g3", named), { kind: "accepted", path: [1] });
});

test("depth is an inclusive full-move cap for both sides, including nonstandard starting clocks", () => {
  const { tree } = importPgn(`[SetUp "1"]
[FEN "${START_FEN.replace(/ 1$/, " 10")}"]

10. e4 c5 11. Nf3 d6 *`);
  const filter = scopeFilter(tree, { maxMove: 10 });
  assert.deepEqual(getDueRepertoireMoves(tree, {}, "w", undefined, filter).map(({ uci }) => uci), ["e2e4"]);
  assert.deepEqual(getDueRepertoireMoves(tree, {}, "b", undefined, filter).map(({ uci }) => uci), ["c7c5"]);
  assert.deepEqual(trainingAttempt(tree, [0], "c7c5", filter), { kind: "accepted", path: [0, 0] });
  assert.deepEqual(trainingAttempt(tree, [0, 0], "g1f3", filter), { kind: "complete" });
});
