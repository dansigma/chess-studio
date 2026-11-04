// SIG-1209: "Retry a mistake in place" session. The pure state machine lives in
// src/chess/retry.ts; this slice adds what needs the store: the board hand-off
// (parent position, flipped orientation, restore on exit), the 600 ms wrong
// move flash and 400 ms reply timers, and the one-record-per-day recording
// into the mistake exercises.
import type { StateCreator } from "zustand";
import { playMoveSound } from "@/src/chess/move-sound";
import {
  RETRY_REPLY_DELAY_MS,
  RETRY_WRONG_FLASH_MS,
  applyMove,
  hint,
  markRecorded,
  outcomeToRecord,
  playReply,
  reveal,
  startRetry as beginRetry,
  type RetryOutcome,
  type RetryState,
  type RetryTarget,
} from "@/src/chess/retry";
import { getLastMove } from "@/src/chess/tree";
import {
  mergeNewExercises,
  recordAttempt,
  type MistakeExercisesMap,
} from "@/src/lib/mistake-exercises-store";
import { markRetryRecorded, retryRecordedToday } from "@/src/lib/retry-recorded";
import { selectActiveBoard } from "./selectors";
import type { RetrySession, StudioState } from "./types";

export type RetrySlice = Pick<
  StudioState,
  "retry" | "startRetry" | "retryMove" | "retryHint" | "revealRetry" | "nextRetry" | "exitRetry"
>;

export const INACTIVE_RETRY: RetrySession = { active: false };

export const initialRetryState = { retry: INACTIVE_RETRY };

// Timers live at module level, not in React: the flash and the reply must
// survive the Review panel unmounting (dock tab switch) and be dropped the
// moment the session ends. `generation` makes a late callback a no-op.
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let replyTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

function clearRetryTimers(): void {
  generation += 1;
  if (flashTimer !== null) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  if (replyTimer !== null) {
    clearTimeout(replyTimer);
    replyTimer = null;
  }
}

function orientationToMove(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

export const createRetrySlice: StateCreator<StudioState, [], [], RetrySlice> = (set, get) => {
  /** Write at most one record for the session, honouring the per-day limit. */
  function commitOutcome(next: RetryState, freePractice: boolean): RetryState {
    const outcome: RetryOutcome | null = outcomeToRecord(next);
    if (!outcome) {
      return next;
    }
    if (!freePractice) {
      const exercise = next.exercise;
      let map: MistakeExercisesMap = get().mistakeExercises;
      // An opponent's mistake (or one evicted from the store) is created on
      // the fly from the review row, under the same `mx:<fenKey>` key.
      if (!map[exercise.key]) {
        map = mergeNewExercises(map, [exercise]);
      }
      get().setMistakeExercises(recordAttempt(map, exercise.key, outcome === "correct"));
      markRetryRecorded(exercise.key);
    }
    return markRecorded(next);
  }

  function enter(target: RetryTarget, queue: RetryTarget[]): boolean {
    const state = get();
    if (state.training) {
      return false;
    }
    const current = state.retry;
    if (current.active && current.boardId !== state.activeBoardId) {
      get().exitRetry();
    }
    const board = selectActiveBoard(get());
    const machine = beginRetry(target.exercise, lastMoveKey(board, target));
    if (!machine) {
      return false;
    }
    clearRetryTimers();
    const previous = get().retry;
    const session: RetrySession = {
      ...machine,
      active: true,
      boardId: board.id,
      exerciseKey: machine.exercise.key,
      momentIndex: target.index,
      parentPath: [...target.parentPath],
      // A second Retry while one is open keeps the ORIGINAL return point.
      returnPath: previous.active ? previous.returnPath : [...board.path],
      returnOrientation: previous.active ? previous.returnOrientation : board.orientation,
      wrongFlash: null,
      freePractice: retryRecordedToday(machine.exercise.key),
      queue,
    };
    set((current) => ({
      retry: session,
      enginePreview: null,
      threat: null,
      variationChoice: null,
      // Neither the cursor move nor the flip dirties the board: both are
      // transient and restored on exit (which marks it dirty once).
      boards: current.boards.map((item) =>
        item.id === board.id
          ? { ...item, path: [...target.parentPath], orientation: orientationToMove(machine.exercise.fen) }
          : item,
      ),
    }));
    return true;
  }

  function lastMoveKey(board: ReturnType<typeof selectActiveBoard>, target: RetryTarget): string {
    const move = getLastMove(board.tree, target.parentPath);
    return move ? `${move.from}${move.to}` : "";
  }

  return {
    ...initialRetryState,
    startRetry: (target, queue = []) => enter(target, queue),
    retryMove: (from, to, promotion) => {
      const session = get().retry;
      if (!session.active || session.wrongFlash) {
        return false;
      }
      const result = applyMove(session, from, to, promotion);
      if (!result.accepted) {
        return false;
      }
      const token = generation;
      const next = commitOutcome(result.retry, session.freePractice);
      if (get().settings.moveSound) {
        playMoveSound();
      }
      set({ retry: { ...session, ...next, wrongFlash: result.flash } });
      if (result.revert) {
        flashTimer = setTimeout(() => {
          flashTimer = null;
          const live = get().retry;
          if (token === generation && live.active) {
            set({ retry: { ...live, wrongFlash: null } });
          }
        }, RETRY_WRONG_FLASH_MS);
      } else if (result.reply) {
        replyTimer = setTimeout(() => {
          replyTimer = null;
          const live = get().retry;
          if (token === generation && live.active) {
            set({ retry: { ...live, ...playReply(live) } });
            if (get().settings.moveSound) {
              playMoveSound();
            }
          }
        }, RETRY_REPLY_DELAY_MS);
      }
      return true;
    },
    retryHint: () => {
      const session = get().retry;
      if (session.active) {
        set({ retry: { ...session, ...hint(session) } });
      }
    },
    revealRetry: () => {
      const session = get().retry;
      if (!session.active || session.status === "solved" || session.status === "revealed") {
        return;
      }
      clearRetryTimers();
      const next = commitOutcome(reveal(session), session.freePractice);
      set({ retry: { ...session, ...next, wrongFlash: null } });
    },
    nextRetry: () => {
      const session = get().retry;
      if (!session.active) {
        return false;
      }
      const target = session.queue.find((item) => item.index > session.momentIndex);
      return target ? enter(target, session.queue) : false;
    },
    exitRetry: (options) => {
      const session = get().retry;
      if (!session.active) {
        return;
      }
      clearRetryTimers();
      const restorePath = options?.restorePath !== false;
      set((state) => ({
        retry: INACTIVE_RETRY,
        boards: state.boards.map((board) =>
          board.id === session.boardId
            ? {
                ...board,
                orientation: session.returnOrientation,
                path: restorePath ? [...session.returnPath] : board.path,
                // Persist the restored cursor/orientation even if an autosave
                // caught the transient retry state in between.
                dirty: true,
              }
            : board,
        ),
      }));
    },
  };
};
