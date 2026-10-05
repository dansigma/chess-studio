import assert from "node:assert/strict";
import test from "node:test";
import { exportPgn, importPgn, openablePgn } from "./pgn.ts";
import { splitPgnGames } from "./pgn-games.ts";
import { createEmptyTree } from "./tree.ts";

const CUSTOM_FEN = "r1bq1rk1/pp3ppp/2n1pn2/2pp4/2P5/2NP1N2/PP2BPPP/R1BQ1RK1 w - - 0 8";

test("export derives FEN/SetUp from a custom startFen and round-trips", () => {
  const tree = createEmptyTree(CUSTOM_FEN);
  tree.children.push({
    id: "n1",
    san: "d4",
    uci: "d2d4",
    fen: "r1bq1rk1/pp3ppp/2n1pn2/2pp4/2PP5/2NP1N2/PP2BPPP/R1BQ1RK1 b - d3 0 8",
    from: "d2",
    to: "d4",
    children: [],
  });
  const pgn = exportPgn(tree, {});
  assert.match(pgn, new RegExp(`\\[FEN "${CUSTOM_FEN.replaceAll("/", "\\/")}"\\]`));
  assert.match(pgn, /\[SetUp "1"\]/);
  const reimported = importPgn(pgn);
  assert.equal(reimported.tree.startFen, CUSTOM_FEN);
  assert.equal(reimported.tree.children[0]?.san, "d4");
});

test("a } in a comment round-trips without an invented escape", () => {
  const tree = createEmptyTree();
  tree.children.push({
    id: "n1",
    san: "e4",
    uci: "e2e4",
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    from: "e2",
    to: "e4",
    comment: "smile } done",
    children: [],
  });
  const pgn = exportPgn(tree, {});
  assert.ok(!pgn.includes("\\}"), "export must not emit an invented \\} escape");
  const reimported = importPgn(pgn);
  assert.equal(reimported.tree.children[0]?.comment, "smile ) done");
  // Second round-trip is stable.
  const again = exportPgn(reimported.tree, reimported.headers);
  assert.equal(again, exportPgn(importPgn(again).tree, importPgn(again).headers));
});

test("a !! NAG round-trips as $3, not as a glyph", () => {
  const tree = createEmptyTree();
  tree.children.push({
    id: "n1",
    san: "e4",
    uci: "e2e4",
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    from: "e2",
    to: "e4",
    nags: [3],
    children: [],
  });
  const pgn = exportPgn(tree, {});
  assert.match(pgn, /\$3/);
  assert.ok(!pgn.includes("e4!!"), "PGN must not carry the UI glyph");
  const reimported = importPgn(pgn);
  assert.deepEqual(reimported.tree.children[0]?.nags, [3]);
});

test("merging games fills empty annotation fields but never overwrites", () => {
  const merged = openablePgn(
    '[Event "A"]\n\n1. e4 *\n\n[Event "B"]\n\n1. e4 {second} *\n',
  );
  assert.ok(merged);
  assert.equal(merged.tree.children[0]?.comment, "second");

  const keepFirst = openablePgn(
    '[Event "A"]\n\n1. e4 {first} *\n\n[Event "B"]\n\n1. e4 {second} *\n',
  );
  assert.ok(keepFirst);
  assert.equal(keepFirst.tree.children[0]?.comment, "first");
});

test("merging games fills empty NAGs from the incoming game", () => {
  const merged = openablePgn(
    '[Event "A"]\n\n1. e4 *\n\n[Event "B"]\n\n1. e4 $3 *\n',
  );
  assert.ok(merged);
  assert.deepEqual(merged.tree.children[0]?.nags, [3]);
});

test("splitPgnGames reuses the shared cleanup pipeline", () => {
  const text = `% engine note\n[Event "A"]\n\n1. e4 {[%clk 0:03:00]} e5 *\n\n[Event "B"]\n\n1. d4 1\u2026 d5 *\n`;
  const chunks = splitPgnGames(text);
  assert.equal(chunks.length, 2);
  for (const chunk of chunks) {
    assert.ok(!chunk.split("\n").some((line) => line.startsWith("%")));
    assert.ok(!chunk.includes("[%clk"));
    assert.ok(!chunk.includes("\u2026"));
  }
  assert.match(chunks[0] ?? "", /1\. e4/);
  assert.match(chunks[1] ?? "", /1\. d4/);
});
