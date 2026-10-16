import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getFenAt, getNodeAt, START_FEN } from "../../chess/tree.ts";
import { emptyBoard } from "./board-helpers.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";
import { useStudioStore } from "../studio-store.ts";

// SIG-944: board-editing/import/setup actions moved out of studio-store.ts into
// this slice. These tests pin the behaviour through the real store so the move
// stays a pure relocation — tree rewrites, dirty flags, guards and status
// messages all keep their original semantics. node --test runs each file in its
// own process, so the store state here cannot leak into other suites.
const GAME_PGN = '[Event "Test Open"]\n[White "W White"]\n[Black "B Black"]\n\n1. e4 e5 2. Nf3 Nc6 *';

function resetBoard(): string {
  const board = emptyBoard("Board", "board-a");
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    settings: { ...DEFAULT_SETTINGS },
    setupMode: false,
    training: false,
    statusMessage: null,
  });
  return board.id;
}

describe("SIG-944 board-edit slice", () => {
  it("flip toggles the active board orientation and marks it dirty", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    assert.equal(store().active().orientation, "white");
    store().flip();
    assert.equal(store().active().orientation, "black");
    assert.equal(store().active().dirty, true);
    store().flip();
    assert.equal(store().active().orientation, "white");
  });

  it("importPgnText rewrites the active board tree and reports bad input", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().importPgnText(GAME_PGN);

    const board = store().active();
    assert.equal(board.title, "W White vs B Black");
    assert.equal(board.path.length, 4, "the imported mainline becomes the current path");
    assert.equal(board.dirty, true);
    assert.equal(board.tree.children.length, 1);
    assert.equal(store().statusMessage, null);

    store().importPgnText("this is not a pgn");
    assert.equal(store().statusMessage, "Could not open that PGN.");
    assert.equal(store().active().tree.children.length, 1, "the rejected import leaves the board alone");
  });

  it("openListedGame reuses the preview board when previews are enabled", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().openListedGame({ title: "First", moves: "e4 e5" });
    const preview = store().active();
    assert.equal(preview.preview, true);
    assert.equal(store().boards.length, 2);

    store().openListedGame({ title: "Second", moves: "d4 d5" });
    assert.equal(store().boards.length, 2, "a second listed game reuses the preview slot");
    assert.equal(store().active().id, preview.id);
    assert.equal(store().active().title, "Second");
    assert.equal(store().active().tree.children[0].san, "d4", "the reused preview is rewritten");
  });

  it("openListedGame appends a board when asked to open in a new board", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().openListedGame({ title: "First", moves: "e4 e5" });
    store().openListedGame({ title: "Second", moves: "d4 d5", openInNewBoard: true });

    assert.equal(store().boards.length, 3);
    assert.equal(store().active().title, "Second");
    assert.equal(store().active().preview, false);
  });

  it("importPlayerGame maps player metadata onto PGN headers", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().importPlayerGame(
      {
        id: "game-a1",
        winner: "white",
        whiteName: "A White",
        whiteRating: 2100,
        blackName: "A Black",
        blackRating: 2000,
        year: 2024,
        month: 5,
        event: "A Open",
        eco: "C50",
        opening: "Test Opening",
        pgn: GAME_PGN,
        moves: "e4 e5",
        color: "white",
        playerResult: "win",
        playedAt: null,
      },
      { openInNewBoard: true },
    );

    const board = store().active();
    assert.equal(board.title, "A White vs A Black");
    assert.deepEqual(board.headers, {
      Event: "A Open",
      White: "A White",
      Black: "A Black",
      Result: "1-0",
      WhiteElo: "2100",
      BlackElo: "2000",
      ECO: "C50",
      Opening: "Test Opening",
      Date: "2024.05.??",
    });
  });

  it("exportActivePgn renders the active board's tree", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().openListedGame({ title: "Export", moves: "e4 e5", headers: { White: "W", Black: "B" } });

    const pgn = store().exportActivePgn();
    assert.match(pgn, /1\. e4 e5/);
    assert.match(pgn, /\[White "W"\]/);
  });

  it("pruneAfter cuts the tree after the current move", () => {
    resetBoard();
    const store = () => useStudioStore.getState();
    store().openListedGame({ title: "Prune", moves: "e4 e5 Nf3 Nc6", openInNewBoard: true });

    store().goPath([0]);
    store().pruneAfter();

    const board = store().active();
    assert.equal(board.path.length, 1);
    assert.equal(getNodeAt(board.tree, [0])?.children.length, 0);
    assert.equal(board.dirty, true);
  });

  it("setMoveComment writes comments on the current and previous move", () => {
    resetBoard();
    const store = () => useStudioStore.getState();
    store().openListedGame({ title: "Comments", moves: "e4 e5", openInNewBoard: true });
    store().goPath([0, 0]);

    store().setMoveComment("nice");
    assert.equal(getNodeAt(store().active().tree, [0, 0])?.comment, "nice");

    store().setMoveCommentBefore("leading");
    assert.equal(getNodeAt(store().active().tree, [0, 0])?.commentBefore, "leading");
  });

  it("insertNullMove is refused in setup mode and inserts otherwise", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().setSetupMode(true);
    assert.equal(store().insertNullMove(), false);
    assert.equal(store().active().path.length, 0);

    store().setSetupMode(false);
    assert.equal(store().insertNullMove(), true);
    const board = store().active();
    assert.equal(board.path.length, 1);
    assert.equal(getNodeAt(board.tree, board.path)?.san, "--");
    assert.equal(board.dirty, true);
    assert.notEqual(getFenAt(board.tree, board.path), START_FEN);
  });

  it("toggles square/arrow marks and clears them in one call", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().openListedGame({ title: "Marks", moves: "e4", openInNewBoard: true });
    store().goPath([0]);
    store().toggleBoardSquareMark("e4", "G");
    store().toggleBoardArrowMark("e4", "e5", "R");
    const marks = getNodeAt(store().active().tree, [0])?.marks;
    assert.deepEqual(marks?.squares, [{ square: "e4", color: "G" }]);
    assert.deepEqual(marks?.arrows, [{ from: "e4", to: "e5", color: "R" }]);

    store().clearBoardMarks();
    assert.equal(getNodeAt(store().active().tree, [0])?.marks, undefined);
  });

  it("toggles and clears move NAGs", () => {
    resetBoard();
    const store = () => useStudioStore.getState();
    store().openListedGame({ title: "Nags", moves: "e4 e5", openInNewBoard: true });
    store().goPath([0, 0]);

    store().toggleMoveNag(1);
    assert.deepEqual(getNodeAt(store().active().tree, [0, 0])?.nags, [1]);
    store().toggleMoveNag(1);
    assert.equal(getNodeAt(store().active().tree, [0, 0])?.nags, undefined);

    store().toggleMoveNag(2);
    store().clearMoveNags();
    assert.equal(getNodeAt(store().active().tree, [0, 0])?.nags, undefined);
  });

  it("setHeaders derives the title and renameActive overrides it", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().setHeaders({ White: "W White", Black: "B Black" });
    assert.equal(store().active().title, "W White vs B Black");
    assert.equal(store().active().dirty, true);

    store().renameActive("Custom");
    assert.equal(store().active().title, "Custom");
  });

  it("applySetupFen validates, applies and records the FEN headers", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    assert.equal(store().applySetupFen("not a fen"), false);
    assert.equal(store().statusMessage, "Invalid setup position");

    assert.equal(store().applySetupFen("4k3/8/8/8/8/8/8/4K3 w - - 0 1"), true);
    const board = store().active();
    assert.equal(board.headers.FEN, "4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    assert.equal(board.headers.SetUp, "1");
    assert.equal(board.tree.startFen, "4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    assert.equal(board.dirty, true);
    assert.equal(store().statusMessage, "Position applied");
    assert.equal(store().setupMode, false);

    assert.equal(store().applySetupFen(START_FEN), true);
    const reset = store().active();
    assert.equal(reset.headers.FEN, undefined, "the start position drops the setup headers");
    assert.equal(reset.headers.SetUp, undefined);
  });

  it("openSharedPosition applies a position without marking the board dirty", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().openSharedPosition("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    const board = store().active();
    assert.equal(board.tree.startFen, "4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    assert.equal(board.dirty, false);

    store().openSharedPosition("nonsense");
    assert.equal(store().active().tree.startFen, "4k3/8/8/8/8/8/8/4K3 w - - 0 1", "invalid input is ignored");
  });

  it("SIG-968 annotateReview applies edits with an undo snapshot, then undo restores", () => {
    resetBoard();
    const store = () => useStudioStore.getState();
    store().openListedGame({ title: "Notes", moves: "e4 e5", openInNewBoard: true });

    const before = store().active().tree;
    const comment = "[Chess Studio review]\n[%eval 0.30]";
    store().annotateReview([
      { path: [0, 0], nags: [1], comment },
      { path: [0], nags: undefined, comment: undefined },
    ]);

    const annotated = store().active();
    assert.equal(annotated.dirty, true);
    assert.deepEqual(getNodeAt(annotated.tree, [0, 0])?.nags, [1]);
    assert.equal(getNodeAt(annotated.tree, [0, 0])?.comment, comment);
    assert.equal(annotated.reviewAnnotateUndo !== undefined, true);
    assert.deepEqual(annotated.reviewAnnotateUndo, before, "snapshot holds the pre-annotate tree");
    assert.notEqual(annotated.tree, before, "annotate writes a new tree");

    store().undoReviewAnnotations();
    const restored = store().active();
    assert.deepEqual(restored.tree, before, "undo restores the exact tree");
    assert.equal(restored.reviewAnnotateUndo, undefined, "the snapshot is consumed");
    assert.equal(restored.dirty, true);

    store().undoReviewAnnotations();
    assert.deepEqual(store().active().tree, before, "a second undo without a snapshot no-ops");
  });

  it("SIG-968 annotateReview with no edits leaves the board untouched", () => {
    resetBoard();
    const store = () => useStudioStore.getState();

    store().annotateReview([]);
    assert.equal(store().active().reviewAnnotateUndo, undefined);
    assert.equal(store().active().dirty, true, "empty board starts dirty");

    store().openListedGame({ title: "Notes", moves: "e4 e5", openInNewBoard: true });
    const clean = store().active();
    assert.equal(clean.dirty, false);
    store().annotateReview([]);
    assert.equal(store().active().reviewAnnotateUndo, undefined);
    assert.equal(store().active().dirty, false, "an empty annotate is a no-op");
  });
});
