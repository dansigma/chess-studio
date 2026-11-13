import { create } from "zustand";
import {
  browserVisibility,
  createBroadcastManager,
  type BroadcastManager,
  type BroadcastManagerDeps,
  type EnqueueOptions,
  type LiveConnection,
} from "@/src/lib/live/broadcast-manager";
import { MAX_LIVE_BOARDS } from "./live-board-model";
import { clearTourGamesCache } from "./live-tour-cache";
import { fetchRound, streamRound } from "@/src/lib/live/lichess-broadcast";
import { mergeSnapshotGame, mergeStreamUpdate } from "@/src/lib/live/merge";
import type { BroadcastRoundSnapshot, LiveGame, LiveGameUpdate } from "@/src/lib/live/types";
import {
  parseLiveUrlState,
  withLiveUrlState,
  type LiveGameRef,
  type LiveUrlState,
} from "@/src/studio/workspace-view-url";

// SIG-1289: Live broadcast state, deliberately separate from `useStudioStore` (separation of concerns;
// `useStudioStore` has no persist middleware either, and live data must never reach storage).
//
// The scheduling rules (one stream per tab, serial request queue, 429 backoff, visibility pause) live in
// `src/lib/live/broadcast-manager.ts`; this store owns the board set and the merged game data.

export type LiveRoundInfo = Pick<BroadcastRoundSnapshot, "tour" | "round" | "group">;

export type LiveState = {
  /** Round open in the games table (Live 5/7), the URL `live=` param. */
  tableRoundId: string | null;
  /** Open live boards (Live 6/7), the URL `games=` param, in opening order. */
  openBoards: LiveGameRef[];
  /** True after an open was refused because `MAX_LIVE_BOARDS` boards are open; cleared by closing a board. */
  boardLimitReached: boolean;
  /** Board with the eval bar, the URL `focus=` param. Always one of `openBoards`, or null. */
  focusedGame: LiveGameRef | null;
  /** Derived. Hot rounds: the table round + the rounds of open boards. They are the followed rounds. */
  followedRounds: string[];
  /** Derived. The one round that gets the stream: the focused board's round, else the table round, else the first board's. */
  streamRoundId: string | null;
  gamesByRound: Record<string, Record<string, LiveGame>>;
  roundInfo: Record<string, LiveRoundInfo>;
  connection: LiveConnection;
  /** Epoch ms when Lichess' 429 pause ends; null when not rate-limited. */
  rateLimitedUntil: number | null;

  setTableRound: (roundId: string | null) => void;
  openBoard: (ref: LiveGameRef, options?: { focus?: boolean }) => void;
  closeBoard: (ref: LiveGameRef) => void;
  focusBoard: (ref: LiveGameRef | null) => void;
  /** Replace the board set from `parseLiveUrlState(search)`. */
  applyLiveUrlState: (url: LiveUrlState) => void;
  /** Leave Live: abort everything and drop all live data. */
  leaveLive: () => void;
  ingestSnapshot: (snapshot: BroadcastRoundSnapshot) => void;
  ingestUpdate: (update: LiveGameUpdate) => void;
};

export function sameGameRef(a: LiveGameRef | null, b: LiveGameRef | null): boolean {
  return a !== null && b !== null && a.roundId === b.roundId && a.gameId === b.gameId;
}

type Selection = Pick<LiveState, "tableRoundId" | "openBoards" | "focusedGame">;

/** Pure: hot rounds (deduped, stable order) and the round to stream. */
export function deriveLiveRounds(s: Selection): { followedRounds: string[]; streamRoundId: string | null } {
  const rounds: string[] = [];
  const add = (roundId: string | null | undefined) => {
    if (roundId && !rounds.includes(roundId)) {
      rounds.push(roundId);
    }
  };
  add(s.tableRoundId);
  s.openBoards.forEach((b) => add(b.roundId));
  return {
    followedRounds: rounds,
    streamRoundId: s.focusedGame?.roundId ?? s.tableRoundId ?? s.openBoards[0]?.roundId ?? null,
  };
}

/** `{round, games, focus}` for `withLiveUrlState`. */
export function toLiveUrlState(s: Selection): LiveUrlState {
  return { round: s.tableRoundId, games: s.openBoards, focus: s.focusedGame };
}

/** The search string for the current Live selection, on top of `search`. */
export function liveSearch(search: string, s: Selection): string {
  return withLiveUrlState(search, toLiveUrlState(s));
}

export { parseLiveUrlState };

// ---- manager wiring (lazy, so importing the store never touches the network) ----

let depsOverride: BroadcastManagerDeps | null = null;
let manager: BroadcastManager | null = null;

function defaultDeps(): BroadcastManagerDeps {
  return {
    fetchRound,
    streamRound,
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
    visibility: browserVisibility(),
  };
}

function getManager(): BroadcastManager {
  if (!manager) {
    manager = createBroadcastManager(depsOverride ?? defaultDeps(), {
      onSnapshot: (snapshot) => useLiveStore.getState().ingestSnapshot(snapshot),
      onUpdate: (update) => useLiveStore.getState().ingestUpdate(update),
      onStatus: (status) => useLiveStore.setState({ connection: status.connection, rateLimitedUntil: status.rateLimitedUntil }),
    });
  }
  return manager;
}

/** Tests: replace the manager's dependencies (null restores the real ones). Drops the current manager. */
export function setLiveManagerDeps(deps: BroadcastManagerDeps | null): void {
  manager?.dispose();
  manager = null;
  depsOverride = deps;
}

/**
 * Public request queue for Live 4/7 (list refresh) and 6/7 (`fetchRoundPgn`): serial, one in flight,
 * 60 s pause after a 429. See the rules at the top of `broadcast-manager.ts`.
 */
export function enqueueLiveRequest<T>(request: (signal: AbortSignal) => Promise<T>, options?: EnqueueOptions): Promise<T> {
  return getManager().enqueue(request, options);
}

function applySelection(set: (partial: Partial<LiveState>) => void, selection: Selection): void {
  const { tableRoundId, openBoards, focusedGame } = selection;
  const derived = deriveLiveRounds({ tableRoundId, openBoards, focusedGame });
  set({ tableRoundId, openBoards, focusedGame, ...derived });
  getManager().sync({ hotRounds: derived.followedRounds, streamRound: derived.streamRoundId });
}

/** URL boards past the cap are dropped; the focused one always survives. */
function capBoards(boards: LiveGameRef[], focus: LiveGameRef | null): LiveGameRef[] {
  if (boards.length <= MAX_LIVE_BOARDS) {
    return boards;
  }
  const kept = boards.slice(0, MAX_LIVE_BOARDS);
  if (focus && !kept.some((b) => sameGameRef(b, focus))) {
    kept[MAX_LIVE_BOARDS - 1] = focus;
  }
  return kept;
}

const EMPTY: Selection = { tableRoundId: null, openBoards: [], focusedGame: null };

export const useLiveStore = create<LiveState>((set, get) => ({
  ...EMPTY,
  followedRounds: [],
  streamRoundId: null,
  boardLimitReached: false,
  gamesByRound: {},
  roundInfo: {},
  connection: "idle",
  rateLimitedUntil: null,

  setTableRound: (tableRoundId) => applySelection(set, { ...get(), tableRoundId }),

  // Past MAX_LIVE_BOARDS a new board is refused (nothing is closed behind the user's back): the open
  // boards and focus stay as they were, and `boardLimitReached` lets the UI say why.
  openBoard: (ref, options) => {
    const s = get();
    const isOpen = s.openBoards.some((b) => sameGameRef(b, ref));
    if (!isOpen && s.openBoards.length >= MAX_LIVE_BOARDS) {
      set({ boardLimitReached: true });
      return;
    }
    const openBoards = isOpen ? s.openBoards : [...s.openBoards, ref];
    const focusedGame = options?.focus === false ? s.focusedGame : ref;
    applySelection(set, { ...s, openBoards, focusedGame });
  },

  closeBoard: (ref) => {
    const s = get();
    const openBoards = s.openBoards.filter((b) => !sameGameRef(b, ref));
    // Focus falls back to the most recently opened remaining board.
    const focusedGame = sameGameRef(s.focusedGame, ref) ? (openBoards[openBoards.length - 1] ?? null) : s.focusedGame;
    set({ boardLimitReached: false });
    applySelection(set, { ...s, openBoards, focusedGame });
  },

  focusBoard: (ref) => {
    const s = get();
    if (ref === null) {
      applySelection(set, { ...s, focusedGame: null });
      return;
    }
    const isOpen = s.openBoards.some((b) => sameGameRef(b, ref));
    if (!isOpen && s.openBoards.length >= MAX_LIVE_BOARDS) {
      set({ boardLimitReached: true });
      return;
    }
    applySelection(set, { ...s, openBoards: isOpen ? s.openBoards : [...s.openBoards, ref], focusedGame: ref });
  },

  applyLiveUrlState: (url) => {
    const openBoards = [...url.games];
    if (url.focus && !openBoards.some((b) => sameGameRef(b, url.focus))) {
      openBoards.push(url.focus);
    }
    applySelection(set, { tableRoundId: url.round, openBoards: capBoards(openBoards, url.focus), focusedGame: url.focus });
  },

  leaveLive: () => {
    manager?.stop();
    clearTourGamesCache();
    set({
      ...EMPTY,
      followedRounds: [],
      streamRoundId: null,
      boardLimitReached: false,
      gamesByRound: {},
      roundInfo: {},
      connection: "idle",
      rateLimitedUntil: null,
    });
  },

  ingestSnapshot: (snapshot) =>
    set((s) => {
      const roundId = snapshot.round.id;
      const current = s.gamesByRound[roundId] ?? {};
      const next: Record<string, LiveGame> = { ...current };
      for (const game of snapshot.games) {
        next[game.id] = mergeSnapshotGame(current[game.id], game);
      }
      return {
        gamesByRound: { ...s.gamesByRound, [roundId]: next },
        roundInfo: { ...s.roundInfo, [roundId]: { tour: snapshot.tour, round: snapshot.round, group: snapshot.group } },
      };
    }),

  ingestUpdate: (update) =>
    set((s) => {
      const current = s.gamesByRound[update.roundId] ?? {};
      const merged = mergeStreamUpdate(current[update.id], update, Date.now());
      if (merged === current[update.id]) {
        return s;
      }
      return { gamesByRound: { ...s.gamesByRound, [update.roundId]: { ...current, [update.id]: merged } } };
    }),
}));
