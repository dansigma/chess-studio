// SIG-1094: store-level proofs for the one-click deviation fixes, through
// the real store (same grain as board-repertoire.test.ts). Events come from
// the real `findDeviation` so kinds/fens/UCIs are realistic, not hand-built.
// Pins: user deviation activates the repertoire board at the deviation
// position with training on and the repertoire move due; opponent gap
// appends the novelty once even when clicked twice and selects it; both fail
// closed with an explanatory status when the side has no marked board.
// node --test runs each file in its own process, so no state leaks.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { findDeviation, type DeviationEvent } from "../../chess/repertoire-deviation.ts";
import { importPgn } from "../../chess/pgn.ts";
import {
  findPathToPosition,
} from "../../chess/repertoire-actions.ts";
import {
  getFenAt,
  getNodeAt,
  playMove,
  type GameTree,
  type Path,
} from "../../chess/tree.ts";
import { repertoireMoveKey } from "../../chess/repertoire.ts";
import { useStudioStore } from "../studio-store.ts";
import { emptyBoard } from "./board-helpers.ts";
import type { BoardOrientation, BoardSession } from "./types.ts";

function treeFromSans(sans: string[]): { tree: GameTree; path: Path } {
  const startFen = new Chess().fen();
  let state: { tree: GameTree; path: Path } = { tree: { startFen, children: [] }, path: [] };
  for (const san of sans) {
    const chess = new Chess(getFenAt(state.tree, state.path));
    const move = chess.move(san);
    if (!move) {
      throw new Error(`illegal ${san}`);
    }
    state = playMove(state.tree, state.path, {
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      from: move.from,
      to: move.to,
    });
  }
  return state;
}

function treeFromPgn(pgn: string): GameTree {
  const imported = importPgn(pgn);
  assert.equal(imported.warnings.length, 0, `PGN failed to import: ${imported.warnings}`);
  return imported.tree;
}

function boardWith(id: string, title: string, tree: GameTree, color: BoardOrientation | null): BoardSession {
  return {
    ...emptyBoard(title, id),
    tree,
    path: [],
    orientation: "white",
    repertoireColor: color,
    dirty: false,
  };
}

function seedBoards(repTree: GameTree, gameTree: GameTree): void {
  useStudioStore.setState({
    boards: [boardWith("rep-white", "White rep", repTree, "white"), boardWith("game-board", "Game", gameTree, null)],
    activeBoardId: "game-board",
    training: false,
    trainingStart: null,
    drillDueOnly: false,
    statusMessage: null,
    repertoireProgress: {},
  });
}

function userDeviationEvent(repTree: GameTree, gameTree: GameTree): DeviationEvent {
  const event = findDeviation({ repertoire: repTree, game: gameTree, userColor: "white" });
  assert.equal(event.kind, "user_deviation");
  return event;
}

function opponentGapEvent(repTree: GameTree, gameTree: GameTree): DeviationEvent {
  const event = findDeviation({ repertoire: repTree, game: gameTree, userColor: "white" });
  assert.equal(event.kind, "opponent_gap");
  return event;
}

describe("SIG-1094 trainDeviationLine", () => {
  it("activates the repertoire board at the deviation, marks the move due, starts training", () => {
    const repTree = treeFromSans(["e4", "e5", "Nf3", "Nc6"]).tree;
    const gameTree = treeFromPgn("1. e4 e5 2. Bc4 *\n");
    seedBoards(repTree, gameTree);
    const event = userDeviationEvent(repTree, gameTree);
    const expected = findPathToPosition(repTree, event.kind === "none" ? "" : event.fen);
    assert.ok(expected, "deviation position must exist in the repertoire");

    useStudioStore.getState().trainDeviationLine(event, "white");

    const state = useStudioStore.getState();
    assert.equal(state.activeBoardId, "rep-white");
    assert.deepEqual(state.active().path, expected);
    assert.equal(state.training, true);
    assert.deepEqual(state.trainingStart, expected);
    if (event.kind === "user_deviation") {
      const key = repertoireMoveKey(event.fen, event.repertoireMoves[0]?.uci ?? "");
      const item = state.repertoireProgress[key];
      assert.ok(item, "repertoire move must be marked due");
      assert.ok(Date.parse(item?.dueDate ?? "") <= Date.now() + 60_000);
    } else {
      assert.fail("expected user_deviation");
    }
  });

  it("ignores other kinds and stays on the game board", () => {
    const repTree = treeFromSans(["e4", "e5", "Nf3", "Nc6"]).tree;
    const gameTree = treeFromPgn("1. e4 c5 *\n");
    seedBoards(repTree, gameTree);
    const gap = opponentGapEvent(repTree, gameTree);

    useStudioStore.getState().trainDeviationLine(gap, "white");

    const state = useStudioStore.getState();
    assert.equal(state.activeBoardId, "game-board");
    assert.equal(state.training, false);
    assert.equal(state.statusMessage, null);
  });

  it("stays on the game board with a status when the deviation left the repertoire", () => {
    const repTree = treeFromSans(["e4", "e5", "Nf3", "Nc6"]).tree;
    const gameTree = treeFromPgn("1. e4 e5 2. Bc4 *\n");
    seedBoards(repTree, gameTree);
    const event = userDeviationEvent(repTree, gameTree);
    // The repertoire dropped the deviation position after the event rendered.
    const state0 = useStudioStore.getState();
    const holder = state0.boards.find((b) => b.id === "rep-white");
    assert.ok(holder);
    const pruned: GameTree = { ...holder.tree, children: [] };
    useStudioStore.setState({
      boards: state0.boards.map((b) => (b.id === "rep-white" ? { ...b, tree: pruned } : b)),
    });

    useStudioStore.getState().trainDeviationLine(event, "white");

    const state = useStudioStore.getState();
    assert.equal(state.activeBoardId, "game-board");
    assert.equal(state.training, false);
    assert.equal(state.statusMessage, "That line is no longer in the repertoire.");
  });

  it("fails closed with an explanatory status when no board is marked (train)", () => {
    const gameTree = treeFromPgn("1. e4 e5 2. Bc4 *\n");
    useStudioStore.setState({
      boards: [boardWith("game-board", "Game", gameTree, null)],
      activeBoardId: "game-board",
      training: false,
      trainingStart: null,
      statusMessage: null,
      repertoireProgress: {},
    });
    const repTree = treeFromSans(["e4", "e5", "Nf3", "Nc6"]).tree;
    const event = userDeviationEvent(repTree, gameTree);

    useStudioStore.getState().trainDeviationLine(event, "white");

    const state = useStudioStore.getState();
    assert.equal(state.activeBoardId, "game-board");
    assert.equal(state.training, false);
    assert.equal(
      state.statusMessage,
      "Mark a board as your White or Black repertoire from the board menu first.",
    );
  });
});

describe("SIG-1094 addGapToRepertoire", () => {
  it("appends the novelty once across double-clicks and selects it", () => {
    const repTree = treeFromSans(["e4", "e5", "Nf3", "Nc6"]).tree;
    const gameTree = treeFromPgn("1. e4 c5 *\n");
    seedBoards(repTree, gameTree);
    const event = opponentGapEvent(repTree, gameTree);
    const store = () => useStudioStore.getState();

    store().addGapToRepertoire(event, "white");
    const firstPath = [...store().active().path];
    const playedUci = event.kind === "none" ? "" : event.playedUci;
    assert.equal(store().activeBoardId, "rep-white");
    assert.ok(firstPath.length > 0, "path must select the new node");
    assert.equal(countUciAtFen(store().active().tree, event, playedUci), 1);

    store().addGapToRepertoire(event, "white");
    const second = store();
    assert.equal(second.activeBoardId, "rep-white");
    assert.deepEqual(second.active().path, firstPath);
    assert.equal(countUciAtFen(second.active().tree, event, playedUci), 1);
    assert.equal(second.active().dirty, true);
    assert.equal(second.statusMessage, "Opponent move added — now play your reply.");
  });

  it("fails closed with an explanatory status when no board is marked (gap)", () => {
    const gameTree = treeFromPgn("1. e4 c5 *\n");
    useStudioStore.setState({
      boards: [boardWith("game-board", "Game", gameTree, null)],
      activeBoardId: "game-board",
      training: false,
      trainingStart: null,
      statusMessage: null,
      repertoireProgress: {},
    });
    const repTree = treeFromSans(["e4", "e5", "Nf3", "Nc6"]).tree;
    const event = opponentGapEvent(repTree, gameTree);

    useStudioStore.getState().addGapToRepertoire(event, "white");

    const state = useStudioStore.getState();
    assert.equal(state.activeBoardId, "game-board");
    assert.equal(
      state.statusMessage,
      "Mark a board as your White or Black repertoire from the board menu first.",
    );
  });

  it("fails closed on an unparsable playedUci without touching the tree", () => {
    const repTree = treeFromSans(["e4", "e5", "Nf3", "Nc6"]).tree;
    const gameTree = treeFromPgn("1. e4 c5 *\n");
    seedBoards(repTree, gameTree);
    const before = JSON.stringify(repTree);
    const bad: DeviationEvent = {
      kind: "opponent_gap",
      ply: 2,
      fen: getFenAt(repTree, [0]),
      playedUci: "junk",
      playedSan: "?",
      repertoireMoves: [],
    };

    useStudioStore.getState().addGapToRepertoire(bad, "white");

    const state = useStudioStore.getState();
    assert.equal(state.activeBoardId, "game-board");
    assert.equal(JSON.stringify(state.boards.find((b) => b.id === "rep-white")?.tree), before);
  });
});

function countUciAtFen(tree: GameTree, event: DeviationEvent, uci: string): number {
  if (event.kind === "none") {
    return 0;
  }
  const path = findPathToPosition(tree, event.fen);
  if (!path) {
    return 0;
  }
  const siblings =
    path.length === 0 ? tree.children : (getNodeAt(tree, path)?.children ?? []);
  return siblings.filter((child) => child.uci === uci).length;
}
