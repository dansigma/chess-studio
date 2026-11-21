import assert from "node:assert/strict";
import test from "node:test";
import { importPgn } from "../../chess/pgn.ts";
import { repertoireMoveKey } from "../../chess/repertoire.ts";
import { START_FEN } from "../../chess/tree.ts";
import { useStudioStore } from "../studio-store.ts";
import { emptyBoard } from "./board-helpers.ts";
import type { BoardSession } from "./types.ts";

const store = useStudioStore.getState;

function seedTraining(pgn: string, options: Partial<Pick<BoardSession, "orientation" | "repertoireColor">> = {}) {
  store().stopTraining();
  const board = { ...emptyBoard("Repertoire", "repertoire"), ...options, tree: importPgn(pgn).tree };
  useStudioStore.setState({
    boards: [board, emptyBoard("Other", "other")],
    activeBoardId: board.id,
    repertoireProgress: {},
    settings: { ...store().settings, locale: "en" },
  });
}

test("Black repertoire starts with an automatic White move and ignores user input during the pause", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 e5 *", { repertoireColor: "black", orientation: "white" });
  const originalRecord = store().recordRepertoireMove;
  const record = t.mock.fn(originalRecord);
  useStudioStore.setState({ recordRepertoireMove: record });
  t.after(() => useStudioStore.setState({ recordRepertoireMove: originalRecord }));
  const progress = store().repertoireProgress;

  store().startTraining();
  t.mock.timers.tick(399);
  assert.deepEqual(store().active().path, []);
  assert.equal(store().makeUciMove("d2", "d4"), false);
  assert.equal(store().makeUciMove("e2", "e4"), false);
  assert.equal(store().statusMessage, null);

  t.mock.timers.tick(1);
  assert.deepEqual(store().active().path, [0]);
  assert.equal(store().repertoireProgress, progress);
  assert.equal(record.mock.callCount(), 0);
  assert.equal(store().makeUciMove("e7", "e5"), true);
  assert.equal(record.mock.callCount(), 1);
});

test("a correct user move schedules the reply and the final reply completes the line", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 e5 *");
  store().startTraining();
  assert.equal(store().makeUciMove("e2", "e4"), true);
  assert.deepEqual(store().active().path, [0]);
  const progress = store().repertoireProgress;
  assert.deepEqual(Object.keys(progress), [repertoireMoveKey(START_FEN, "e2e4")]);

  t.mock.timers.tick(400);
  assert.deepEqual(store().active().path, [0, 0]);
  assert.equal(store().statusMessage, "Line complete.");
  assert.equal(store().repertoireProgress, progress);
});

test("stopping training or switching boards cancels a pending opponent reply", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 *", { orientation: "black" });
  store().startTraining();
  store().stopTraining();
  t.mock.timers.tick(400);
  assert.deepEqual(store().active().path, []);

  store().startTraining();
  store().setActiveBoard("other");
  t.mock.timers.tick(400);
  assert.equal(store().active().id, "other");
  assert.ok(store().boards.every((board) => board.path.length === 0));
});

test("restarting at the same position gives the new reply its own full delay", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 *", { orientation: "black" });
  store().startTraining();
  t.mock.timers.tick(200);
  store().startTraining();
  t.mock.timers.tick(200);
  assert.deepEqual(store().active().path, []);
  t.mock.timers.tick(200);
  assert.deepEqual(store().active().path, [0]);
});

test("hints reveal the piece then the move without rescheduling a missed position", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 (1. d4) e5 2. Nf3 *");
  store().startTraining();
  store().showTrainingHint();
  assert.equal(store().trainingMiss, null);
  assert.equal(store().makeUciMove("c2", "c4"), false);
  assert.equal(store().statusMessage, "Not in your repertoire");
  assert.equal(store().trainingMiss?.hint, 0);
  assert.equal(store().trainingMiss?.uci, "e2e4");
  const progress = store().repertoireProgress;
  for (const uci of ["e2e4", "d2d4"]) {
    assert.equal(progress[repertoireMoveKey(START_FEN, uci)].mistakeCount, 1);
  }

  store().showTrainingHint();
  assert.equal(store().trainingMiss?.hint, 1);
  store().showTrainingHint();
  assert.equal(store().trainingMiss?.hint, 2);
  store().showTrainingHint();
  assert.equal(store().trainingMiss?.hint, 2);
  assert.equal(store().makeUciMove("e2", "e4"), true);
  assert.equal(store().repertoireProgress, progress);
  assert.equal(store().trainingMiss, null);

  t.mock.timers.tick(400);
  assert.equal(store().trainingMiss, null);
  assert.equal(store().makeUciMove("f1", "c4"), false);
  assert.equal(store().trainingMiss?.hint, 0);
  assert.equal(store().trainingMiss?.uci, "g1f3");
});

test("a second wrong move reveals the answer and restarting, stopping or switching clears it", () => {
  seedTraining("1. e4 *");
  store().startTraining();
  store().makeUciMove("c2", "c4");
  const progress = store().repertoireProgress;
  store().makeUciMove("d2", "d4");
  assert.equal(store().trainingMiss?.hint, 2);
  store().makeUciMove("g1", "f3");
  assert.equal(store().repertoireProgress, progress);

  store().startTraining();
  assert.equal(store().trainingMiss, null);
  store().makeUciMove("d2", "d4");
  assert.equal(store().trainingMiss?.hint, 0);
  store().stopTraining();
  assert.equal(store().trainingMiss, null);
  store().startTraining();
  store().makeUciMove("d2", "d4");
  store().setActiveBoard("other");
  assert.equal(store().trainingMiss, null);
});

test("due drill localizes wrong moves and completion statuses without recording a recovered success", () => {
  seedTraining("1. e4 *");
  useStudioStore.setState({ settings: { ...store().settings, locale: "pt-br" } });
  store().startDueDrill();
  assert.equal(store().makeUciMove("d2", "d4"), false);
  assert.equal(store().statusMessage, "Não está no repertório");
  const progress = store().repertoireProgress;
  assert.equal(store().makeUciMove("e2", "e4"), true);
  assert.equal(store().repertoireProgress, progress);
  assert.equal(store().trainingMiss, null);
  assert.equal(store().statusMessage, "Todas as revisões concluídas!");
  store().startDueDrill();
  assert.equal(store().statusMessage, "Nenhuma revisão pendente.");

  useStudioStore.setState({ training: true, drillDueOnly: true });
  assert.equal(store().makeUciMove("e7", "e5"), false);
  assert.equal(store().statusMessage, "Linha concluída.");
});

test("due review replays each ply from the root and ignores moves until the question", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 e5 2. Nf3 Nc6 *", { orientation: "black" });
  store().toEnd();
  store().recordRepertoireMove(store().active().tree.children[0].fen, "e7e5", true);
  const progress = store().repertoireProgress;

  store().startDueDrill();
  assert.deepEqual(store().active().path, []);
  assert.equal(store().dueDrill?.total, 1);
  t.mock.timers.tick(300);
  assert.deepEqual(store().active().path, [0]);
  assert.equal(store().makeUciMove("e7", "e5"), false);
  assert.equal(store().makeUciMove("c7", "c5"), false);
  assert.equal(store().repertoireProgress, progress);
  assert.equal(store().trainingMiss, null);
  t.mock.timers.tick(300);
  assert.deepEqual(store().active().path, [0, 0]);
  t.mock.timers.tick(299);
  assert.equal(store().dueDrill?.replaying, true);
  t.mock.timers.tick(1);
  assert.deepEqual(store().active().path, [0, 0, 0]);
  assert.equal(store().dueDrill?.replaying, false);
  assert.equal(store().makeUciMove("b8", "c6"), true);
  assert.equal(store().training, false);
});

test("due moves on the current line come before a sibling variation", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 (1. d4 d5 2. c4) e5 2. Nf3 *");
  store().startDueDrill();

  assert.equal(store().dueDrill?.total, 4);
  assert.equal(store().makeUciMove("e2", "e4"), true);
  assert.deepEqual(store().active().path, [0]);
  assert.equal(store().dueDrill?.queue.length, 3);
  t.mock.timers.tick(100);
  store().skipDueReplay();
  assert.deepEqual(store().active().path, [0, 0]);
  assert.equal(store().makeUciMove("g1", "f3"), true);

  assert.deepEqual(store().active().path, []);
  assert.equal(store().dueDrill?.queue.length, 2);
  assert.equal(store().makeUciMove("d2", "d4"), true);
  t.mock.timers.tick(200);
  assert.deepEqual(store().active().path, [1], "the skipped timer did not advance the new replay");
  t.mock.timers.tick(100);
  assert.deepEqual(store().active().path, [1, 0]);
  assert.equal(store().makeUciMove("c2", "c4"), true);
  assert.equal(store().training, false);
});

test("stopping, restarting, and switching boards invalidate pending due replay steps", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 e5 *", { orientation: "black" });
  store().startDueDrill();
  store().stopTraining();
  t.mock.timers.tick(300);
  assert.deepEqual(store().active().path, []);

  store().startDueDrill();
  t.mock.timers.tick(200);
  store().startDueDrill();
  t.mock.timers.tick(100);
  assert.deepEqual(store().active().path, []);

  store().setActiveBoard("other");
  t.mock.timers.tick(300);
  assert.equal(store().dueDrill, null);
  assert.ok(store().boards.every((board) => board.path.length === 0));
});

test("due replay skips targets removed from the tree", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  seedTraining("1. e4 e5 (1... c5) *", { orientation: "black" });
  store().startDueDrill();
  useStudioStore.setState({
    boards: [{ ...store().active(), tree: importPgn("1. e4 c5 *").tree }],
  });

  t.mock.timers.tick(300);
  assert.deepEqual(store().active().path, []);
  assert.equal(store().dueDrill?.queue.length, 1);
  store().skipDueReplay();
  assert.deepEqual(store().active().path, [0]);
  assert.equal(store().makeUciMove("c7", "c5"), true);
});

test("a different repertoire move keeps the current due question and hints its answer", () => {
  seedTraining("1. e4 (1. d4) *");
  store().startDueDrill();

  assert.equal(store().makeUciMove("d2", "d4"), false);
  assert.equal(store().statusMessage, "Try the move being reviewed");
  assert.equal(store().trainingMiss?.uci, "e2e4");
  assert.equal(store().dueDrill?.queue.length, 2);
  assert.equal(store().repertoireProgress[repertoireMoveKey(START_FEN, "d2d4")], undefined);
  assert.equal(store().makeUciMove("e2", "e4"), true);
  assert.equal(store().makeUciMove("d2", "d4"), true);
});
