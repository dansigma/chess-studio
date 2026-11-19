// SIG-1186 testable dirty-board save pass. The shell wires this into its
// debounced effect; unit tests drive it with fakes. Store-free: all state
// access goes through the injected callbacks so this module never imports
// the store (same grain as lib/studio-persistence.ts).
import type { BoardSession } from "@/src/store/slices/types";
import { compareRepertoirePersistOrder } from "@/src/store/slices/selectors";

export const AUTOSAVE_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];
export const AUTOSAVE_MAX_RETRY_DELAY_MS = 30000;
/** Catch-up iterations per board per pass before deferring to the next pass. */
export const AUTOSAVE_MAX_CATCHUP_PERSISTS = 5;

export type SavePassDeps = {
  getBoards: () => BoardSession[];
  persist: (board: BoardSession) => Promise<string | null>;
  markSaved: (id: string, remoteId: string) => void;
  onError?: () => void;
};

type RetryState = {
  failures: number;
  nextRetryAt: number;
  burstNotified: boolean;
};

/** One running save per board id, shared by the autosave pass and manual saves. */
const inflight = new Map<string, Promise<BoardSaveOutcome>>();
const retries = new Map<string, RetryState>();
/**
 * Row id returned by the first insert of a board whose store copy has no
 * remoteId yet (the insert's snapshot went stale, so markSaved was skipped).
 * Later persists of that board send it, so they update the row instead of
 * inserting a second one. Cleared once the board is marked saved or closed.
 */
const insertedRemoteIds = new Map<string, string>();
const retryListeners = new Set<() => void>();

/**
 * Called whenever a failed save records a retry deadline, whoever ran the
 * save (the autosave pass or an explicit Save), so the shell can arm its
 * retry wakeup. Returns the unsubscribe function.
 */
export function subscribeAutosaveRetries(listener: () => void): () => void {
  retryListeners.add(listener);
  return () => {
    retryListeners.delete(listener);
  };
}

function retryDelayMs(failures: number): number {
  if (failures <= 0) {
    return AUTOSAVE_RETRY_DELAYS_MS[0];
  }
  const index = Math.min(failures - 1, AUTOSAVE_RETRY_DELAYS_MS.length - 1);
  return AUTOSAVE_RETRY_DELAYS_MS[index];
}

/** Earliest due retry timestamp, or null when nothing is scheduled. */
export function nextAutosaveRetryAt(): number | null {
  let earliest: number | null = null;
  for (const state of retries.values()) {
    if (earliest === null || state.nextRetryAt < earliest) {
      earliest = state.nextRetryAt;
    }
  }
  return earliest;
}

/** The autosave pass persists (and so retries) only dirty, non-preview boards. */
function autosaveRetries(board: BoardSession | undefined): boolean {
  return board !== undefined && board.dirty && !board.preview;
}

/**
 * Drop retry state for boards that no longer exist (closed or replaced) and
 * for boards the pass would not retry (clean or preview): their deadline
 * would never be consumed, and a past deadline keeps the shell's retry
 * wakeup firing at once.
 */
export function pruneAutosaveRetries(boards: BoardSession[]): void {
  const ids = new Set(boards.map((board) => board.id));
  const byId = new Map(boards.map((board) => [board.id, board]));
  for (const id of [...retries.keys()]) {
    if (!autosaveRetries(byId.get(id))) {
      retries.delete(id);
    }
  }
  for (const id of [...insertedRemoteIds.keys()]) {
    if (!ids.has(id)) {
      insertedRemoteIds.delete(id);
    }
  }
}

/** Test hook: reset module-level in-flight and retry state. */
export function resetAutosaveStateForTests(): void {
  inflight.clear();
  retries.clear();
  insertedRemoteIds.clear();
  retryListeners.clear();
}

function noteFailure(id: string, now: number, onError?: () => void): void {
  const previous = retries.get(id);
  const failures = (previous?.failures ?? 0) + 1;
  retries.set(id, {
    failures,
    nextRetryAt: now + retryDelayMs(failures),
    burstNotified: true,
  });
  if (!previous && onError) {
    // One notification per failure burst, not one per retry.
    onError();
  }
  for (const listener of retryListeners) {
    listener();
  }
}

function noteSuccess(id: string): void {
  retries.delete(id);
}

/**
 * - `saved`: the live board was persisted and marked saved.
 * - `declined`: persist returned no id (signed out); the board stays dirty.
 * - `failed`: persist threw; the failure feeds the retry backoff.
 * - `deferred`: newer edits kept landing mid-save; a later pass finishes.
 * - `closed`: the board no longer exists.
 */
export type BoardSaveOutcome = "saved" | "declined" | "failed" | "deferred" | "closed";

/**
 * Persist one board until the saved snapshot is still the live object: after
 * each persist, re-read the board by id and mark it saved only when it is the
 * same reference; otherwise persist the newer object (SIG-1186), up to
 * AUTOSAVE_MAX_CATCHUP_PERSISTS times. `manual` persists at least once even
 * when the board is clean or a preview, as an explicit Save does.
 */
async function persistUntilCurrent(
  id: string,
  deps: SavePassDeps,
  now: number,
  manual: boolean,
): Promise<BoardSaveOutcome> {
  let current = deps.getBoards().find((board) => board.id === id);
  let force = manual;
  let catchup = 0;
  while (current && (force || (current.dirty && (manual || !current.preview)))) {
    force = false;
    const snapshot = current;
    const inserted = snapshot.remoteId ? undefined : insertedRemoteIds.get(id);
    let remoteId: string | null;
    try {
      remoteId = await deps.persist(inserted ? { ...snapshot, remoteId: inserted } : snapshot);
    } catch {
      // An explicit Save may have sent a clean or preview board, which the
      // pass never retries: record a retry only when the pass will run it.
      if (!manual || autosaveRetries(deps.getBoards().find((board) => board.id === id))) {
        noteFailure(id, now, deps.onError);
      }
      return "failed";
    }
    if (!remoteId) {
      // Persist declined (e.g. signed out mid-flight) — leave dirty and
      // stop; the shell effect re-runs when the dependency changes.
      return "declined";
    }
    if (!snapshot.remoteId) {
      insertedRemoteIds.set(id, remoteId);
    }
    const live = deps.getBoards().find((board) => board.id === id);
    if (!live) {
      // Board closed while saving — drop retry state, nothing to mark.
      retries.delete(id);
      insertedRemoteIds.delete(id);
      return "closed";
    }
    if (live !== snapshot) {
      // SIG-1186: a newer edit landed mid-save — loop and persist the
      // new object instead of marking the stale snapshot saved.
      catchup += 1;
      if (catchup >= AUTOSAVE_MAX_CATCHUP_PERSISTS) {
        return "deferred";
      }
      current = live;
      continue;
    }
    deps.markSaved(snapshot.id, remoteId);
    insertedRemoteIds.delete(id);
    noteSuccess(id);
    return "saved";
  }
  return current ? "saved" : "closed";
}

/**
 * Persist every dirty board once. At most one in-flight save per board id;
 * boards already in flight are skipped (a later pass picks them up), and
 * boards in retry backoff wait for their next retry time.
 */
export async function runDirtySavePass(deps: SavePassDeps, now = Date.now()): Promise<void> {
  const boards = deps
    .getBoards()
    .filter((board) => board.dirty && !board.preview)
    .sort(compareRepertoirePersistOrder);
  for (const seed of boards) {
    if (inflight.has(seed.id)) {
      continue;
    }
    const retry = retries.get(seed.id);
    if (retry && retry.nextRetryAt > now) {
      continue;
    }
    const running = persistUntilCurrent(seed.id, deps, now, false);
    inflight.set(seed.id, running);
    try {
      await running;
    } finally {
      inflight.delete(seed.id);
    }
  }
  pruneAutosaveRetries(deps.getBoards());
}

/**
 * Explicit Save of one board (menu Save, Ctrl+S). Waits for a save already
 * running on that board (autosave or another Save) so the two never insert
 * the same new board twice, then persists the live board with the same
 * stale-snapshot check as the autosave pass. Ignores the retry backoff: the
 * user asked to save now. A failure still feeds the backoff.
 */
export async function saveBoardNow(id: string, deps: SavePassDeps, now = Date.now()): Promise<BoardSaveOutcome> {
  for (let running = inflight.get(id); running; running = inflight.get(id)) {
    await running.catch(() => undefined);
  }
  const mine = persistUntilCurrent(id, deps, now, true);
  inflight.set(id, mine);
  try {
    return await mine;
  } finally {
    if (inflight.get(id) === mine) {
      inflight.delete(id);
    }
  }
}
