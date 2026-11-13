import { create } from "zustand";
import { importOne, splitPgnFiles, type ConflictChoice, type PgnImportDeps } from "./pgn-import-queue";

export type ImportEntryState = "waiting" | "importing" | "awaiting" | "done" | "cancelled" | "failed";

export type ImportEntry = {
  id: string;
  name: string;
  state: ImportEntryState;
  done: number;
  total: number;
  imported?: number;
  overLimit?: number;
  unreadable?: number;
  /** How a `done` file landed: a new database, or the existing one replaced / merged. */
  mode?: "new" | "replace" | "merge";
  /** Merge: games added, and games the database already had. */
  added?: number;
  duplicates?: number;
  /** Why a `failed` entry failed: the 50-database limit or an unreadable file. */
  error?: "database-limit" | "read";
};

export type PendingConflict = {
  entryId: string;
  fileName: string;
  databaseName: string;
  keepBothAllowed: boolean;
};

type ImportQueueState = {
  entries: ImportEntry[];
  /** The name conflict the queue is waiting on; the dialog renders it. */
  pendingConflict: PendingConflict | null;
  /** Answers the pending conflict dialog (Esc / Cancel = "cancel"). */
  answerConflict: (choice: ConflictChoice) => void;
  /** Cancels an importing file (saves nothing) or removes a waiting one. */
  cancel: (id: string) => void;
  /** Clears the widget; ignored while a file is waiting or importing. */
  dismiss: () => void;
};

export const useImportQueue = create<ImportQueueState>(() => ({
  entries: [],
  pendingConflict: null,
  answerConflict: (choice) => settleConflict(choice),
  cancel: (id) => cancelEntry(id),
  dismiss: () => {
    const { entries } = useImportQueue.getState();
    if (!entries.some(isActive)) {
      useImportQueue.setState({ entries: [] });
    }
  },
}));

export type ImportQueueDeps = Omit<PgnImportDeps, "resolveConflict"> & {
  /** Called once the queue drains, with the ids imported since it started. */
  onDrained?: (importedIds: string[]) => void;
};

type Pending = { id: string; file: File };

let pending: Pending[] = [];
let controllers = new Map<string, AbortController>();
let running: Promise<void> | null = null;
let runIds: string[] = [];

const isActive = (entry: ImportEntry) =>
  entry.state === "waiting" || entry.state === "importing" || entry.state === "awaiting";

let settlePending: ((choice: ConflictChoice) => void) | null = null;

function settleConflict(choice: ConflictChoice) {
  const settle = settlePending;
  settlePending = null;
  useImportQueue.setState({ pendingConflict: null });
  settle?.(choice);
}

/** Opens the dialog for one file and resolves with the answer ("cancel" if aborted). */
function askConflict(
  entryId: string,
  fileName: string,
  databaseName: string,
  keepBothAllowed: boolean,
  signal?: AbortSignal,
): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve("cancel");
      return;
    }
    settlePending = resolve;
    signal?.addEventListener("abort", () => settleConflict("cancel"), { once: true });
    useImportQueue.setState({ pendingConflict: { entryId, fileName, databaseName, keepBothAllowed } });
  });
}

function patch(id: string, changes: Partial<ImportEntry>) {
  useImportQueue.setState((state) => ({
    entries: state.entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
  }));
}

function cancelEntry(id: string) {
  const entry = useImportQueue.getState().entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }
  if (entry.state === "waiting") {
    pending = pending.filter((item) => item.id !== id);
    useImportQueue.setState((state) => ({ entries: state.entries.filter((item) => item.id !== id) }));
  } else if (entry.state === "importing" || entry.state === "awaiting") {
    controllers.get(id)?.abort();
  }
}

async function runQueue(deps: ImportQueueDeps) {
  runIds = [];
  for (let next = pending.shift(); next; next = pending.shift()) {
    const { id, file } = next;
    const controller = new AbortController();
    controllers.set(id, controller);
    patch(id, { state: "importing" });
    try {
      const outcome = await importOne(
        file,
        {
          ...deps,
          resolveConflict: (existing, fileName, { keepBothAllowed, signal }) =>
            askConflict(id, fileName, existing.name, keepBothAllowed, signal),
        },
        {
          signal: controller.signal,
          onAwaitingConflict: () => patch(id, { state: "awaiting" }),
          onProgress: ({ done, total }) => patch(id, { done, total }),
        },
      );
      if (outcome.kind === "database-limit") {
        patch(id, { state: "failed", error: "database-limit" });
      } else if (outcome.kind === "unreadable") {
        patch(id, { state: "failed", error: "read" });
      } else if (outcome.kind === "skipped") {
        patch(id, { state: "cancelled" });
      } else if (outcome.kind === "merged") {
        runIds.push(outcome.id);
        patch(id, {
          state: "done",
          mode: "merge",
          added: outcome.added,
          duplicates: outcome.duplicates,
          overLimit: outcome.overLimit,
          unreadable: outcome.unreadable,
        });
      } else {
        runIds.push(outcome.id);
        patch(id, {
          state: "done",
          mode: outcome.kind === "replaced" ? "replace" : "new",
          imported: outcome.imported,
          overLimit: outcome.overLimit,
          unreadable: outcome.unreadable,
        });
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        patch(id, { state: "cancelled" });
      } else {
        // One unreadable file must not stop the rest of the batch.
        patch(id, { state: "failed", error: "read" });
      }
    } finally {
      controllers.delete(id);
    }
  }
  const ids = runIds;
  runIds = [];
  deps.onDrained?.(ids);
}

/**
 * Queues the `.pgn` files and imports them one after another. Returns the
 * names of the files that were not `.pgn`, and a promise that settles when the
 * queue (including files added meanwhile) has drained.
 */
export function enqueuePgnFiles(
  files: File[],
  deps: ImportQueueDeps,
): { skipped: string[]; done: Promise<void> } {
  const { pgn, skipped } = splitPgnFiles(files);
  if (pgn.length === 0) {
    return { skipped, done: running ?? Promise.resolve() };
  }
  const added = pgn.map((file) => ({ id: crypto.randomUUID(), file }));
  pending.push(...added);
  useImportQueue.setState((state) => ({
    // A new batch replaces finished entries; active ones stay.
    entries: [
      ...state.entries.filter(isActive),
      ...added.map(({ id, file }): ImportEntry => ({ id, name: file.name, state: "waiting", done: 0, total: 0 })),
    ],
  }));
  if (!running) {
    running = runQueue(deps).finally(() => {
      running = null;
      if (pending.length > 0) {
        void enqueuePgnFiles([], deps);
      }
    });
  }
  return { skipped, done: running };
}

/** Test helper: forgets every queued file and entry. */
export function resetImportQueue() {
  for (const controller of controllers.values()) {
    controller.abort();
  }
  pending = [];
  controllers = new Map();
  settlePending = null;
  useImportQueue.setState({ entries: [], pendingConflict: null });
}
