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

const inflight = new Set<string>();
const retries = new Map<string, RetryState>();

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

/** Drop retry state for boards that no longer exist (closed or replaced). */
export function pruneAutosaveRetries(boards: BoardSession[]): void {
  const ids = new Set(boards.map((board) => board.id));
  for (const id of [...retries.keys()]) {
    if (!ids.has(id)) {
      retries.delete(id);
    }
  }
}

/** Test hook: reset module-level in-flight and retry state. */
export function resetAutosaveStateForTests(): void {
  inflight.clear();
  retries.clear();
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
}

function noteSuccess(id: string): void {
  retries.delete(id);
}

/**
 * Persist every dirty board once. For each board: capture the current object,
 * await persist, then re-read the board by id — mark saved only when the
 * live object is still the same reference; otherwise loop and persist the
 * new object, with a bounded number of catch-up iterations per board per
 * pass (a later pass picks up anything beyond the bound). At most one
 * in-flight save per board id; boards already in flight are skipped (a
 * later pass picks them up).
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
    inflight.add(seed.id);
    try {
      let current = deps.getBoards().find((board) => board.id === seed.id);
      let catchup = 0;
      while (current && current.dirty && !current.preview) {
        const snapshot = current;
        let remoteId: string | null;
        try {
          remoteId = await deps.persist(snapshot);
        } catch {
          noteFailure(seed.id, now, deps.onError);
          break;
        }
        if (!remoteId) {
          // Persist declined (e.g. signed out mid-flight) — leave dirty and
          // stop; the shell effect re-runs when the dependency changes.
          break;
        }
        const live = deps.getBoards().find((board) => board.id === seed.id);
        if (!live) {
          // Board closed while saving — drop retry state, nothing to mark.
          retries.delete(seed.id);
          break;
        }
        if (live !== snapshot) {
          // SIG-1186: a newer edit landed mid-save — loop and persist the
          // new object instead of marking the stale snapshot saved.
          catchup += 1;
          if (catchup >= AUTOSAVE_MAX_CATCHUP_PERSISTS) {
            break;
          }
          current = live;
          continue;
        }
        deps.markSaved(snapshot.id, remoteId);
        noteSuccess(seed.id);
        break;
      }
    } finally {
      inflight.delete(seed.id);
    }
  }
  pruneAutosaveRetries(deps.getBoards());
}
