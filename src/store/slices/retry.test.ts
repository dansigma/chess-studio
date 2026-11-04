import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";

before(() => setupDom());
after(() => teardownDom());

const { useStudioStore } = await import("../studio-store.ts");
const { emptyBoard } = await import("./board-helpers.ts");
const { getFenAt } = await import("../../chess/tree.ts");
const { RETRY_RECORDED_KEY, MISTAKE_EXERCISES_KEY } = await import("../../lib/local-cache.ts");
type RetryTarget = import("../../chess/retry.ts").RetryTarget;
type MistakeExercise = import("../../chess/mistake-exercises.ts").MistakeExercise;

const store = () => useStudioStore.getState();

function exerciseAt(fen: string, patch: Partial<MistakeExercise>): MistakeExercise {
  return {
    key: `mx:${fen.split(" ").slice(0, 4).join(" ")}`,
    fen,
    solutionUci: ["c7c5"],
    bestPv: ["c7c5"],
    playedUci: "e7e5",
    label: "blunder",
    phase: "opening",
    lossCp: 300,
    beforePawns: 0.2,
    afterPawns: -2.8,
    motif: "positional",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

/** Board on 1.e4 e5 2.Nf3, cursor at the end. Targets: 1...e5 (black) and 2.Nf3 (white). */
function seed(): { black: RetryTarget; white: RetryTarget } {
  useStudioStore.setState({ boards: [{ ...emptyBoard("Retry", "retry-board"), dirty: false }], activeBoardId: "retry-board" });
  store().makeUciMove("e2", "e4");
  store().makeUciMove("e7", "e5");
  store().makeUciMove("g1", "f3");
  store().markSaved("retry-board", "remote-retry");
  const board = store().active();
  const fenAfterE4 = getFenAt(board.tree, [0]);
  const fenAfterE5 = getFenAt(board.tree, [0, 0]);
  const black: RetryTarget = {
    momentPath: [0, 0],
    parentPath: [0],
    index: 1,
    exercise: exerciseAt(fenAfterE4, { fromOpponent: true }),
  };
  const white: RetryTarget = {
    momentPath: [0, 0, 0],
    parentPath: [0, 0],
    index: 2,
    exercise: exerciseAt(fenAfterE5, { solutionUci: ["b1c3"], bestPv: ["b1c3"], playedUci: "g1f3" }),
  };
  return { black, white };
}

beforeEach(() => {
  mock.timers.reset();
  store().exitRetry({ restorePath: false });
  window.localStorage.clear();
  useStudioStore.setState({ mistakeExercises: {} });
});

describe("retry slice", () => {
  it("opens on the parent position, flips to the side to move and keeps the tree untouched", () => {
    const { black } = seed();
    const treeBefore = store().active().tree;
    assert.equal(store().startRetry(black), true);
    const board = store().active();
    assert.deepEqual(board.path, [0]);
    assert.equal(board.orientation, "black");
    assert.equal(store().retry.active, true);
    assert.equal(board.tree, treeBefore);
    assert.equal(board.dirty, false, "entering a retry does not dirty the board");
  });

  it("refuses an ineligible target", () => {
    const { black } = seed();
    const bad = { ...black, exercise: { ...black.exercise, playedUci: black.exercise.solutionUci[0] } };
    assert.equal(store().startRetry(bad), false);
    assert.equal(store().retry.active, false);
  });

  it("intercepts makeUciMove: a retry move never enters the tree", () => {
    const { black } = seed();
    store().startRetry(black);
    const tree = store().active().tree;
    assert.equal(store().makeUciMove("c7", "c5"), true);
    assert.equal(store().active().tree, tree);
    const solved = store().retry;
    assert.ok(solved.active && solved.status === "solved");
    // An illegal move is refused and nothing changes.
    assert.equal(store().makeUciMove("c5", "c3"), false);
  });

  it("a wrong move flashes for 600 ms, then reverts; the tree and notation are unchanged", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { black } = seed();
    store().startRetry(black);
    const tree = store().active().tree;
    assert.equal(store().makeUciMove("d7", "d6"), true);
    const flashing = store().retry;
    assert.ok(flashing.active && flashing.wrongFlash);
    assert.match(flashing.wrongFlash.fen, /rnbqkbnr\/ppp1pppp\/3p4/);
    assert.equal(flashing.status, "wrong");
    // Moves are ignored while the wrong move is on the board.
    assert.equal(store().makeUciMove("c7", "c5"), false);
    mock.timers.tick(599);
    {
      const live = store().retry;
      assert.ok(live.active && live.wrongFlash);
    }
    mock.timers.tick(1);
    const settled = store().retry;
    assert.ok(settled.active);
    assert.equal(settled.wrongFlash, null);
    assert.equal(settled.fen, black.exercise.fen);
    assert.equal(store().active().tree, tree);
    assert.equal(store().makeUciMove("c7", "c5"), true, "no attempt limit: solve after the miss");
  });

  it("plays the reply after 400 ms and drops it when the retry is exited first", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { black } = seed();
    const threePly = {
      ...black,
      exercise: { ...black.exercise, solutionUci: ["c7c5", "g1f3", "d7d6"], bestPv: ["c7c5", "g1f3", "d7d6"] },
    };
    store().startRetry(threePly);
    store().makeUciMove("c7", "c5");
    let retry = store().retry;
    assert.ok(retry.active && retry.awaitingReply && retry.status === "continuing");
    mock.timers.tick(399);
    {
      const live = store().retry;
      assert.ok(live.active && live.ply === 1);
    }
    mock.timers.tick(1);
    retry = store().retry;
    assert.ok(retry.active && retry.ply === 2 && !retry.awaitingReply);
    assert.equal(retry.lastMove, "g1f3");

    // Exiting between the move and the reply leaves no stray timer behind.
    store().exitRetry();
    store().startRetry(threePly);
    store().makeUciMove("c7", "c5");
    store().exitRetry();
    mock.timers.tick(1000);
    assert.equal(store().retry.active, false);
  });

  it("Exit restores the previous path and orientation", () => {
    const { black } = seed();
    const before = store().active();
    store().startRetry(black);
    store().makeUciMove("d7", "d6");
    store().exitRetry();
    const board = store().active();
    assert.deepEqual(board.path, before.path);
    assert.equal(board.orientation, "white");
    assert.equal(store().retry.active, false);
  });

  it("navigating (goPath, back, forward) exits the retry", () => {
    const { black } = seed();
    store().startRetry(black);
    store().goPath([0, 0]);
    assert.equal(store().retry.active, false);
    assert.deepEqual(store().active().path, [0, 0]);
    assert.equal(store().active().orientation, "white");

    store().startRetry(black);
    store().back();
    assert.equal(store().retry.active, false);
    assert.equal(store().active().orientation, "white");

    store().startRetry(black);
    store().toStart();
    assert.equal(store().retry.active, false);
    assert.deepEqual(store().active().path, []);
  });

  it("Next mistake opens the next target in game order and Exit still returns to the original spot", () => {
    const { black, white } = seed();
    const queue = [black, white];
    store().startRetry(black, queue);
    assert.equal(store().nextRetry(), true);
    const board = store().active();
    assert.deepEqual(board.path, [0, 0]);
    assert.equal(board.orientation, "white");
    assert.equal(store().nextRetry(), false, "no mistake after the last one");
    store().exitRetry();
    assert.deepEqual(store().active().path, [0, 0, 0]);
    assert.equal(store().active().orientation, "white");
  });

  it("a board change outside the explicit exits ends the retry (safety net)", () => {
    const { black } = seed();
    store().startRetry(black);
    useStudioStore.setState((state) => ({
      boards: state.boards.map((board) => ({ ...board, path: [] })),
    }));
    assert.equal(store().retry.active, false);
    assert.equal(store().active().orientation, "white");
  });
});

describe("retry recording", () => {
  const stored = () => store().mistakeExercises;

  it("first-try solve records correct on solve", () => {
    const { white } = seed();
    store().startRetry(white);
    assert.equal(Object.keys(stored()).length, 0, "nothing is recorded before a decisive event");
    store().makeUciMove("b1", "c3");
    const entry = stored()[white.exercise.key];
    assert.ok(entry?.srs, "an unscheduled or missing exercise is created and scheduled");
    assert.equal(entry.srs.mistakeCount, 0);
    assert.ok(window.localStorage.getItem(MISTAKE_EXERCISES_KEY)?.includes(white.exercise.key), "saved locally");
  });

  it("exiting before any move records nothing", () => {
    const { white } = seed();
    store().startRetry(white);
    store().retryHint();
    store().exitRetry();
    assert.deepEqual(stored(), {});
    assert.equal(window.localStorage.getItem(RETRY_RECORDED_KEY), null);
  });

  it("the first wrong move records incorrect immediately, and a later solve adds nothing", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const { white } = seed();
    store().startRetry(white);
    store().makeUciMove("d2", "d4");
    const afterMiss = stored()[white.exercise.key];
    assert.equal(afterMiss.srs?.mistakeCount, 1);
    mock.timers.tick(600);
    store().makeUciMove("b1", "c3");
    assert.deepEqual(stored()[white.exercise.key], afterMiss, "still one record");
  });

  it("a hint turns the solve into an incorrect record", () => {
    const { white } = seed();
    store().startRetry(white);
    store().retryHint();
    const hinted = store().retry;
    assert.ok(hinted.active && hinted.hintSquare === "b1");
    assert.equal(Object.keys(stored()).length, 0, "the hint alone is not decisive");
    store().makeUciMove("b1", "c3");
    assert.equal(stored()[white.exercise.key].srs?.mistakeCount, 1);
  });

  it("Show solution records incorrect once and reveals the line", () => {
    const { white } = seed();
    store().startRetry(white);
    store().revealRetry();
    store().revealRetry();
    const retry = store().retry;
    assert.ok(retry.active && retry.status === "revealed");
    assert.equal(stored()[white.exercise.key].srs?.mistakeCount, 1);
  });

  it("an opponent's mistake is created on the fly with fromOpponent and merged", () => {
    const { black } = seed();
    store().startRetry(black);
    store().makeUciMove("c7", "c5");
    const entry = stored()[black.exercise.key];
    assert.equal(entry.exercise.fromOpponent, true);
    assert.ok(entry.srs);
  });

  it("records at most once per exercise per local day; later entries are free practice", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: new Date(2026, 5, 1, 9, 0).getTime() });
    const { white } = seed();
    store().startRetry(white);
    store().makeUciMove("b1", "c3");
    const first = stored()[white.exercise.key];
    assert.ok(first.srs);
    store().exitRetry();

    // Same day: free practice, even a miss writes nothing.
    mock.timers.setTime(new Date(2026, 5, 1, 22, 0).getTime());
    store().startRetry(white);
    const again = store().retry;
    assert.ok(again.active && again.freePractice);
    store().makeUciMove("d2", "d4");
    store().revealRetry();
    assert.deepEqual(stored()[white.exercise.key], first);
    store().exitRetry();

    // Next local day: counts again.
    mock.timers.setTime(new Date(2026, 5, 2, 0, 5).getTime());
    store().startRetry(white);
    const nextDay = store().retry;
    assert.ok(nextDay.active && !nextDay.freePractice);
    store().revealRetry();
    assert.notDeepEqual(stored()[white.exercise.key], first);
    assert.equal(stored()[white.exercise.key].srs?.mistakeCount, 1);
  });

  it("the 300 exercise cap applies when the entry is created on the fly", () => {
    const { white } = seed();
    const full: Record<string, { exercise: MistakeExercise; srs: null }> = {};
    for (let i = 0; i < 300; i += 1) {
      full[`mx:filler-${i}`] = {
        exercise: exerciseAt("8/8/8/8/8/8/8/K6k w - - 0 1", { key: `mx:filler-${i}`, createdAt: `2025-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z` }),
        srs: null,
      };
    }
    useStudioStore.setState({ mistakeExercises: full });
    store().startRetry(white);
    store().makeUciMove("b1", "c3");
    assert.equal(Object.keys(stored()).length, 300);
    assert.ok(stored()[white.exercise.key], "the newest entry survives the eviction");
  });
});
