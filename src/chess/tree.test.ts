import assert from "node:assert/strict";
import test from "node:test";
import {
  START_FEN,
  canMakeMainline,
  canPromote,
  createEmptyTree,
  deleteAfter,
  deleteVariation,
  fenKey,
  flattenMainLine,
  getFenAt,
  getLastMove,
  getMarksAt,
  getNodeAt,
  goBack,
  goEnd,
  goForward,
  goForwardN,
  goStart,
  isPrefix,
  mainlinePathForFen,
  makeMainline,
  moveNumberForPath,
  pathsEqual,
  playMove,
  plyColor,
  promoteVariation,
  setNodeComment,
  setNodeCommentBefore,
  setNodeMarks,
  setNodeNags,
  variationPoints,
  type GameTree,
  type TreeNode,
} from "./tree.ts";

function node(overrides: Partial<TreeNode> & { uci: string }): TreeNode {
  return {
    id: overrides.uci,
    san: overrides.san ?? overrides.uci,
    fen: overrides.fen ?? `fen-${overrides.uci}`,
    from: overrides.from ?? overrides.uci.slice(0, 2),
    to: overrides.to ?? overrides.uci.slice(2, 4),
    children: overrides.children ?? [],
    ...overrides,
  } as TreeNode;
}

function sampleTree(): GameTree {
  return {
    startFen: START_FEN,
    children: [
      node({
        uci: "e2e4",
        san: "e4",
        fen: "fen-e4",
        from: "e2",
        to: "e4",
        children: [
          node({ uci: "e7e5", san: "e5", fen: "fen-e5", from: "e7", to: "e5" }),
          node({ uci: "c7c5", san: "c5", fen: "fen-c5", from: "c7", to: "c5" }),
        ],
      }),
      node({ uci: "d2d4", san: "d4", fen: "fen-d4", from: "d2", to: "d4" }),
    ],
  };
}

const MOVE_E4 = { san: "e4", uci: "e2e4", fen: "fen-e4", from: "e2", to: "e4" };

test("createEmptyTree uses START_FEN by default", () => {
  assert.deepEqual(createEmptyTree(), { startFen: START_FEN, children: [] });
  assert.equal(createEmptyTree("custom").startFen, "custom");
});

test("playMove appends a new node and advances the path", () => {
  const tree = createEmptyTree();
  const { tree: next, path } = playMove(tree, [], MOVE_E4);
  assert.deepEqual(path, [0]);
  assert.equal(next.children[0]?.uci, "e2e4");
  // original is untouched (immutable update)
  assert.equal(tree.children.length, 0);
});

test("playMove reuses an existing UCI instead of duplicating", () => {
  const tree = createEmptyTree();
  const first = playMove(tree, [], MOVE_E4);
  const second = playMove(first.tree, [], MOVE_E4);
  assert.deepEqual(second.path, [0]);
  assert.equal(second.tree.children.length, 1);
});

test("playMove on an invalid path returns the input unchanged", () => {
  const tree = sampleTree();
  const result = playMove(tree, [9], MOVE_E4);
  assert.equal(result.tree, tree);
  assert.deepEqual(result.path, [9]);
});

test("getNodeAt and getFenAt resolve nodes with start-fen fallback", () => {
  const tree = sampleTree();
  assert.equal(getNodeAt(tree, [0])?.san, "e4");
  assert.equal(getNodeAt(tree, [0, 1])?.san, "c5");
  assert.equal(getNodeAt(tree, [5]), null);
  assert.equal(getFenAt(tree, [0]), "fen-e4");
  assert.equal(getFenAt(tree, [5]), START_FEN);
  assert.equal(getFenAt(tree, []), START_FEN);
});

test("goBack/goForward/goStart navigate one step", () => {
  const tree = sampleTree();
  assert.deepEqual(goBack([0, 1]), [0]);
  assert.deepEqual(goBack([]), []);
  assert.deepEqual(goStart(), []);
  assert.deepEqual(goForward(tree, []), [0]);
  assert.deepEqual(goForward(tree, [1]), [1]);
  assert.deepEqual(goForward(tree, [0, 0]), [0, 0]);
});

test("goEnd follows the mainline to the leaf", () => {
  const tree = sampleTree();
  assert.deepEqual(goEnd(tree, []), [0, 0]);
  assert.deepEqual(goEnd(tree, [1]), [1]);
});

test("goForwardN advances several steps and stops at leaves", () => {
  const tree = sampleTree();
  assert.deepEqual(goForwardN(tree, [], 2), [0, 0]);
  assert.deepEqual(goForwardN(tree, [], 99), [0, 0]);
});

test("deleteAfter clears continuations but keeps the node", () => {
  const tree = sampleTree();
  const next = deleteAfter(tree, [0]);
  assert.equal(getNodeAt(next, [0])?.san, "e4");
  assert.deepEqual(getNodeAt(next, [0])?.children, []);
  // invalid path clears the whole tree
  assert.deepEqual(deleteAfter(tree, [9]).children, []);
});

test("promoteVariation swaps a sideline up and remaps the path", () => {
  const tree = sampleTree();
  const { tree: next, path } = promoteVariation(tree, [0, 1]);
  assert.deepEqual(path, [0, 0]);
  assert.equal(getNodeAt(next, [0, 0])?.san, "c5");
  assert.equal(getNodeAt(next, [0, 1])?.san, "e5");
});

test("promoteVariation is a no-op at index 0 or on an empty path", () => {
  const tree = sampleTree();
  assert.deepEqual(promoteVariation(tree, [0]).path, [0]);
  assert.deepEqual(promoteVariation(tree, []).path, []);
  assert.equal(promoteVariation(tree, [0]).tree, tree);
});

test("makeMainline reorders every level and maps the path to zeros", () => {
  const tree = sampleTree();
  const { tree: next, path } = makeMainline(tree, [0, 1]);
  assert.deepEqual(path, [0, 0]);
  assert.equal(getNodeAt(next, [0, 0])?.san, "c5");
});

test("makeMainline is a no-op for all-zero and empty paths", () => {
  const tree = sampleTree();
  assert.equal(makeMainline(tree, []).tree, tree);
  assert.equal(makeMainline(tree, [0, 0]).tree, tree);
  assert.equal(makeMainline(tree, [9]).tree, tree);
});

test("deleteVariation removes a sideline and selects its neighbour", () => {
  const tree = sampleTree();
  const { tree: next, path } = deleteVariation(tree, [0, 1]);
  assert.deepEqual(path, [0, 0]);
  assert.equal(next.children[0]?.children.length, 1);
  assert.equal(getNodeAt(next, [0, 0])?.san, "e5");
});

test("deleteVariation on an empty path clears the whole tree", () => {
  const tree = sampleTree();
  const { tree: next, path } = deleteVariation(tree, []);
  assert.deepEqual(next.children, []);
  assert.deepEqual(path, []);
});

test("canPromote and canMakeMainline read the path shape", () => {
  assert.equal(canPromote([]), false);
  assert.equal(canPromote([0]), false);
  assert.equal(canPromote([1]), true);
  assert.equal(canPromote([0, 2]), true);
  assert.equal(canMakeMainline([]), false);
  assert.equal(canMakeMainline([0, 0]), false);
  assert.equal(canMakeMainline([0, 1]), true);
});

test("setNodeComment sets, trims and clears comments", () => {
  const tree = sampleTree();
  assert.equal(getNodeAt(setNodeComment(tree, [0], "  hello  "), [0])?.comment, "hello");
  assert.equal(getNodeAt(setNodeComment(tree, [0], "   "), [0])?.comment, undefined);
  assert.equal(setNodeComment(tree, [], "intro").startComment, "intro");
  // invalid path returns the input tree
  assert.equal(setNodeComment(tree, [9], "x"), tree);
});

test("setNodeCommentBefore ignores the root path", () => {
  const tree = sampleTree();
  assert.equal(setNodeCommentBefore(tree, [], "x"), tree);
  const next = setNodeCommentBefore(tree, [0], "before");
  assert.equal(getNodeAt(next, [0])?.commentBefore, "before");
  assert.equal(setNodeCommentBefore(tree, [9], "x"), tree);
});

test("setNodeNags sets and clears NAG lists", () => {
  const tree = sampleTree();
  assert.deepEqual(getNodeAt(setNodeNags(tree, [0], [1, 3]), [0])?.nags, [1, 3]);
  assert.equal(getNodeAt(setNodeNags(tree, [0], []), [0])?.nags, undefined);
  assert.equal(setNodeNags(tree, [9], [1]), tree);
});

test("setNodeMarks and getMarksAt round-trip node and root marks", () => {
  const tree = sampleTree();
  const marks = { squares: [{ color: "G" as const, square: "e4" }], arrows: [] };
  const next = setNodeMarks(tree, [0], marks);
  assert.deepEqual(getMarksAt(next, [0]), marks);
  assert.equal(getMarksAt(setNodeMarks(tree, [0], undefined), [0]), undefined);
  const rooted = setNodeMarks(tree, [], marks);
  assert.deepEqual(getMarksAt(rooted, []), marks);
  assert.equal(setNodeMarks(tree, [9], marks), tree);
});

test("fenKey keeps the first four FEN fields", () => {
  assert.equal(fenKey(`${START_FEN} extra`), fenKey(START_FEN));
  assert.equal(fenKey("a b c d e f"), "a b c d");
});

test("path helpers compare and prefix-match paths", () => {
  assert.equal(pathsEqual([0, 1], [0, 1]), true);
  assert.equal(pathsEqual([0], [1]), false);
  assert.equal(pathsEqual([0], [0, 1]), false);
  assert.equal(isPrefix([0], [0, 1]), true);
  assert.equal(isPrefix([1], [0, 1]), false);
});

test("getLastMove returns from/to or null", () => {
  const tree = sampleTree();
  assert.deepEqual(getLastMove(tree, [0]), { from: "e2", to: "e4" });
  assert.equal(getLastMove(tree, [9]), null);
  assert.equal(getLastMove(createEmptyTree(), []), null);
});

test("variationPoints walks the path then the mainline tail", () => {
  const tree = sampleTree();
  const points = variationPoints(tree, [1]);
  assert.equal(points[0]?.san, null);
  assert.equal(points[1]?.san, "d4");
  const mainline = variationPoints(tree, []);
  assert.deepEqual(
    mainline.map((point) => point.san),
    [null, "e4", "e5"],
  );
});

test("mainlinePathForFen finds mainline positions by key", () => {
  const tree = sampleTree();
  assert.deepEqual(mainlinePathForFen(tree, START_FEN), []);
  assert.deepEqual(mainlinePathForFen(tree, "fen-e4"), [0]);
  assert.deepEqual(mainlinePathForFen(tree, "fen-e5"), [0, 0]);
  // sidelines are not on the mainline
  assert.deepEqual(mainlinePathForFen(tree, "fen-c5"), []);
  assert.deepEqual(mainlinePathForFen(tree, "unknown"), []);
});

test("flattenMainLine follows children[0]", () => {
  const tree = sampleTree();
  assert.deepEqual(
    flattenMainLine(tree).map((n) => n.san),
    ["e4", "e5"],
  );
  assert.deepEqual(flattenMainLine(createEmptyTree()), []);
});

test("plyColor and moveNumberForPath derive turn info from the start FEN", () => {
  assert.equal(plyColor(START_FEN, 1), "w");
  assert.equal(plyColor(START_FEN, 2), "b");
  assert.equal(moveNumberForPath(START_FEN, 1), 1);
  assert.equal(moveNumberForPath(START_FEN, 2), 1);
  assert.equal(moveNumberForPath(START_FEN, 3), 2);
});
