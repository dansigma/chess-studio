import { importPgn } from "@/src/chess/pgn";
import type { BoardSession } from "@/src/store/slices/types";
import {
  readSnapshotBoard,
  snapshotRecordToBoard,
  toSnapshotBoardRecord,
} from "./guest-boards";
import { readRawCache, removeRawCache, writeRawCache } from "./local-cache";

// SIG-1186 signed-in session snapshot: a per-user local journal of pending
// changes plus the last active board, so a fast reload restores moves, cursor
// position, and selection without waiting for (or depending on) Supabase.
// Cross-device resume is out of scope — Supabase stays the source of truth
// for board content; this snapshot only covers the last session on this
// browser. Guest snapshots live under their own key (guest-boards.ts);
// account snapshots are namespaced per user id.
export const SESSION_BOARDS_KEY_PREFIX = "studio-clone-session:";
const SESSION_BOARDS_VERSION = 1;

export function sessionKeyFor(userId: string): string {
  return `${SESSION_BOARDS_KEY_PREFIX}${userId}`;
}

export type SessionSnapshot = {
  boards: BoardSession[];
  activeBoardId: string;
};

/** The subset of a remote `boards` row the boot merge reads. */
export type RemoteBoardRow = {
  id: string;
  title: string;
  pgn: string;
  current_node_path: number[] | null;
  orientation: BoardSession["orientation"];
  repertoire_color: string | null;
  /** SIG-1199: set when the board was closed; absent on pre-migration schemas. */
  closed_at?: string | null;
};

/**
 * SIG-1186: boot merge of the local journal with the remote rows.
 *
 * Dirty local boards win (they carry pending changes); otherwise the remote row
 * wins. Session-only and remote-only boards are kept. `rows: null` means the
 * remote read failed or was aborted, so the local snapshot is returned
 * untouched instead of being replaced by an empty list.
 *
 * SIG-1199: rows stamped `closed_at` are saved boards the user closed; they
 * stay in Supabase but are not restored, unless this browser's snapshot still
 * has them open (closed elsewhere, reopened here).
 *
 * The active board is resolved from the snapshot by identity, including the
 * case where a clean local board was replaced by its remote row (local `id`
 * differs from `remoteId`) — that mismatch used to fall through to the first
 * (most recently updated) remote board.
 */
export function mergeSessionBoards(
  local: SessionSnapshot | null,
  rows: RemoteBoardRow[] | null,
): SessionSnapshot | null {
  if (rows === null) {
    return local;
  }
  const localByRemote = new Map<string, BoardSession>();
  for (const board of local?.boards ?? []) {
    if (board.remoteId) {
      localByRemote.set(board.remoteId, board);
    }
  }
  const seenLocalIds = new Set<string>();
  const merged: BoardSession[] = [];
  for (const row of rows) {
    if (row.closed_at && !localByRemote.has(row.id)) {
      continue;
    }
    const imported = importPgn(row.pgn);
    const session: BoardSession = {
      id: row.id,
      remoteId: row.id,
      title: row.title,
      tree: imported.tree,
      path: row.current_node_path ?? imported.path,
      headers: imported.headers,
      orientation: row.orientation,
      repertoireColor:
        row.repertoire_color === "white" || row.repertoire_color === "black"
          ? row.repertoire_color
          : null,
      dirty: false,
      preview: false,
    };
    const localBoard = localByRemote.get(row.id);
    if (localBoard?.dirty) {
      merged.push(localBoard);
      seenLocalIds.add(localBoard.id);
    } else {
      merged.push(session);
      if (localBoard) {
        seenLocalIds.add(localBoard.id);
      }
    }
  }
  for (const board of local?.boards ?? []) {
    // Session-only boards (remoteId null — new, clone) are kept verbatim.
    if (!seenLocalIds.has(board.id)) {
      merged.push(board);
    }
  }
  if (merged.length === 0) {
    return null;
  }
  return { boards: merged, activeBoardId: resolveActiveBoardId(local, merged) };
}

/** Resolve the snapshot's active board against the merged list. */
export function resolveActiveBoardId(local: SessionSnapshot | null, merged: BoardSession[]): string {
  const wanted = local?.boards.find((board) => board.id === local.activeBoardId);
  if (wanted) {
    if (merged.some((board) => board.id === wanted.id)) {
      return wanted.id;
    }
    if (wanted.remoteId) {
      const byRemote = merged.find(
        (board) => board.remoteId === wanted.remoteId || board.id === wanted.remoteId,
      );
      if (byRemote) {
        return byRemote.id;
      }
    }
  }
  return merged[0].id;
}

export function loadSessionBoards(userId: string): SessionSnapshot | null {
  if (!userId) {
    return null;
  }
  const raw = readRawCache(sessionKeyFor(userId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const envelope = parsed as Record<string, unknown>;
    if (envelope.version !== SESSION_BOARDS_VERSION || !Array.isArray(envelope.boards)) {
      return null;
    }
    const boards: BoardSession[] = [];
    for (const item of envelope.boards) {
      const record = readSnapshotBoard(item);
      if (!record) {
        continue;
      }
      boards.push(snapshotRecordToBoard(record, record.title, record.id));
    }
    if (boards.length === 0) {
      return null;
    }
    const activeBoardId =
      typeof envelope.activeBoardId === "string" &&
      boards.some((board) => board.id === envelope.activeBoardId)
        ? (envelope.activeBoardId as string)
        : boards[0].id;
    return { boards, activeBoardId };
  } catch {
    return null;
  }
}

export function saveSessionBoards(
  userId: string,
  boards: BoardSession[],
  activeBoardId: string,
): void {
  if (typeof window === "undefined" || !userId) {
    return;
  }
  const records = boards
    .filter((board) => !board.preview)
    .map(toSnapshotBoardRecord);
  writeRawCache(
    sessionKeyFor(userId),
    JSON.stringify({
      version: SESSION_BOARDS_VERSION,
      boards: records,
      activeBoardId,
    }),
  );
}

export function clearSessionBoards(userId: string): void {
  if (!userId) {
    return;
  }
  removeRawCache(sessionKeyFor(userId));
}
