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
