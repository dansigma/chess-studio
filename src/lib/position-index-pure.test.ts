import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "../chess/tree.ts";
import type { GameTree } from "../chess/tree.ts";
import { mergeStatRows, resultBucket, rowsForTree, visitGameTree } from "./position-index.ts";

// Hand-built literal GameTree objects — no chess.js involved, so this file
// runs even without optional dependencies installed.

const FEN_AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const FEN_AFTER_D4 = "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1";
const FEN_AFTER_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

function twoBranchTree(): GameTree {
  return {
    startFen: START_FEN,
    children: [
      {
        id: "n-e4",
        san: "e4",
        uci: "e2e4",
        fen: FEN_AFTER_E4,
        from: "e2",
        to: "e4",
        children: [
          {
            id: "n-e5",
            san: "e5",
            uci: "e7e5",
            fen: FEN_AFTER_E5,
            from: "e7",
            to: "e5",
            children: [],
          },
        ],
      },
      {
        id: "n-d4",
        san: "d4",
        uci: "d2d4",
        fen: FEN_AFTER_D4,
        from: "d2",
        to: "d4",
        children: [],
      },
    ],
  };
}

test("resultBucket maps results to white/black/draws", () => {
  assert.equal(resultBucket("1-0"), "white");
  assert.equal(resultBucket("0-1"), "black");
  assert.equal(resultBucket("1/2-1/2"), "draws");
  assert.equal(resultBucket("*"), "draws");
  assert.equal(resultBucket(null), "draws");
  assert.equal(resultBucket(undefined), "draws");
  assert.equal(resultBucket(""), "draws");
});

test("visitGameTree emits position/move events with ply on a 2-branch tree", () => {
  const events: string[] = [];
  visitGameTree(twoBranchTree(), (event) => {
    if (event.type === "position") {
      events.push(`pos leaf=${event.leaf}`);
    } else {
      events.push(`move ${event.san} ply=${event.ply}`);
    }
  });
  assert.deepEqual(events, [
    "pos leaf=false",
    "move e4 ply=1",
    "pos leaf=false",
    "move e5 ply=2",
    "pos leaf=true",
    "move d4 ply=1",
    "pos leaf=true",
  ]);
});

test("visitGameTree reports an empty tree as a single leaf position", () => {
  const events: string[] = [];
  visitGameTree({ startFen: START_FEN, children: [] }, (event) => {
    events.push(event.type);
  });
  assert.deepEqual(events, ["position"]);
});

test("rowsForTree assigns unique seq and move-row ply", () => {
  const { positions } = rowsForTree(twoBranchTree(), "g1", "white");
  const seqs = positions.map((row) => row.seq);
  assert.equal(new Set(seqs).size, positions.length);
  assert.deepEqual(seqs, [1, 2, 3, 4, 5]);
  // 3 move rows (e4 ply 1, e5 ply 2, d4 ply 1) + 2 leaf rows (large ply).
  const moveRows = positions.filter((row) => row.next_uci !== null);
  assert.equal(moveRows.length, 3);
  assert.deepEqual(
    moveRows.map((row) => row.ply),
    [1, 2, 1],
  );
  for (const row of positions) {
    assert.equal(row.game_id, "g1");
  }
});

test("rowsForTree leaf rows use 1_000_000+leafPly and null next_uci", () => {
  const { positions } = rowsForTree(twoBranchTree(), "g1", "white");
  const leafRows = positions.filter((row) => row.next_uci === null);
  assert.equal(leafRows.length, 2);
  assert.equal(leafRows[0]?.ply, 1_000_001);
  assert.equal(leafRows[1]?.ply, 1_000_002);
});

test("rowsForTree dedupes stats by `${zkey}|${uci}`", () => {
  const tree = twoBranchTree();
  // Duplicate the e4 line: same fenBefore + same uci must not add a second stat.
  tree.children.push({
    id: "n-e4-dup",
    san: "e4",
    uci: "e2e4",
    fen: FEN_AFTER_E4,
    from: "e2",
    to: "e4",
    children: [],
  });
  const { positions, stats } = rowsForTree(tree, "g1", "white");
  // Duplicate move still gets its own position row but no extra stat entry.
  assert.equal(positions.filter((row) => row.next_uci === "e2e4").length, 2);
  assert.equal(stats.size, 3);
  for (const [, stat] of stats) {
    assert.equal(stat.bucket, "white");
  }
});

test("rowsForTree start-only tree yields no rows", () => {
  const { positions, stats } = rowsForTree({ startFen: START_FEN, children: [] }, "g1", "white");
  assert.deepEqual(positions, []);
  assert.equal(stats.size, 0);
});

test("mergeStatRows aggregates games/white_wins/draws/black_wins by key", () => {
  const rows = mergeStatRows("db1", [
    { zkey: "k1", nextUci: "e2e4", bucket: "white" },
    { zkey: "k1", nextUci: "e2e4", bucket: "black" },
    { zkey: "k1", nextUci: "d2d4", bucket: "draws" },
    { zkey: "k2", nextUci: "e2e4", bucket: "white" },
  ]);
  assert.equal(rows.length, 3);
  const e4 = rows.find((row) => row.zkey === "k1" && row.next_uci === "e2e4");
  assert.equal(e4?.database_id, "db1");
  assert.equal(e4?.games, 2);
  assert.equal(e4?.white_wins, 1);
  assert.equal(e4?.black_wins, 1);
  assert.equal(e4?.draws, 0);
  const d4 = rows.find((row) => row.next_uci === "d2d4");
  assert.equal(d4?.games, 1);
  assert.equal(d4?.draws, 1);
});

test("mergeStatRows on empty contributions returns no rows", () => {
  assert.deepEqual(mergeStatRows("db1", []), []);
});
