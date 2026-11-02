import { exportPgn, importPgn } from "@/src/chess/pgn";
import { getNodeAt } from "@/src/chess/tree";
import { emptyBoard } from "@/src/store/slices/board-helpers";
import type { BoardOrientation, BoardSession } from "@/src/store/slices/types";
import { readRawCache, writeRawCache } from "./local-cache";

// SIG-1186: shared board-record conversion for the local session snapshots.
// Guest (`GUEST_BOARDS_KEY`) and signed-in (`session key per user`) snapshots
// share the record shape; only the envelope key and board selection differ.
export type SnapshotBoardRecord = {
  id: string;
  remoteId: string | null;
  title: string;
  pgn: string;
  path: number[];
  headers: Record<string, string>;
  orientation: BoardOrientation;
  repertoireColor: BoardOrientation | null;
  dirty: boolean;
};

function isGameHeaders(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === "string",
  );
}

function isBoardOrientation(value: unknown): value is BoardOrientation {
  return value === "white" || value === "black";
}

// SIG-1092 guest boards: guests never touch Supabase, so their boards only
// lived in memory — a reload wiped the repertoire mark (and the position).
// Persist the guest session list to localStorage as PGN + metadata so the
// mark and the position survive a browser reload. Account boards are never
// written here; the shell skips guest hydration/persist once a user exists.
// Preview boards are transient UI and are dropped on save.
export const GUEST_BOARDS_KEY = "studio-clone-guest-boards";
const GUEST_BOARDS_VERSION = 1;

export function readSnapshotBoard(value: unknown): SnapshotBoardRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }
  if (typeof record.pgn !== "string") {
    return null;
  }
  const repertoireColor =
    record.repertoireColor === "white" || record.repertoireColor === "black"
      ? record.repertoireColor
      : null;
  return {
    id: record.id,
    remoteId: typeof record.remoteId === "string" && record.remoteId ? record.remoteId : null,
    title: typeof record.title === "string" && record.title ? record.title : "Board",
    pgn: record.pgn,
    path: Array.isArray(record.path)
      ? record.path.filter((entry): entry is number => typeof entry === "number")
      : [],
    headers: isGameHeaders(record.headers) ? record.headers : {},
    orientation: isBoardOrientation(record.orientation) ? record.orientation : "white",
    repertoireColor,
    dirty: record.dirty === true,
  };
}

export function toSnapshotBoardRecord(board: BoardSession): SnapshotBoardRecord {
  return {
    id: board.id,
    remoteId: board.remoteId,
    title: board.title,
    pgn: exportPgn(board.tree, board.headers),
    path: [...board.path],
    headers: { ...board.headers },
    orientation: board.orientation,
    repertoireColor: board.repertoireColor,
    dirty: board.dirty,
  };
}

export function snapshotRecordToBoard(record: SnapshotBoardRecord, title: string, id: string): BoardSession {
  const imported = importPgn(record.pgn);
  const base = emptyBoard(title, id);
  return {
    ...base,
    title: record.title,
    remoteId: record.remoteId,
    tree: imported.tree,
    // Fail closed on a stale path: a path that no longer resolves resets
    // to the imported end instead of crashing the shell on getNodeAt.
    path: getNodeAt(imported.tree, record.path) ? record.path : imported.path,
    headers: { ...imported.headers, ...record.headers },
    orientation: record.orientation,
    repertoireColor: record.repertoireColor,
    dirty: record.dirty,
    preview: false,
  };
}

type GuestBoardRecord = SnapshotBoardRecord;

function readGuestBoard(value: unknown): GuestBoardRecord | null {
  return readSnapshotBoard(value);
}

function toGuestBoardRecord(board: BoardSession): GuestBoardRecord {
  return toSnapshotBoardRecord(board);
}

export function loadGuestBoards(): { boards: BoardSession[]; activeBoardId: string } | null {
  const raw = readRawCache(GUEST_BOARDS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const envelope = parsed as Record<string, unknown>;
    if (envelope.version !== GUEST_BOARDS_VERSION || !Array.isArray(envelope.boards)) {
      return null;
    }
    const boards: BoardSession[] = [];
    for (const item of envelope.boards) {
      const record = readGuestBoard(item);
      if (!record) {
        continue;
      }
      boards.push({ ...snapshotRecordToBoard(record, record.title, record.id), dirty: false });
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

export function saveGuestBoards(boards: BoardSession[], activeBoardId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const records = boards
    .filter((board) => !board.preview && board.remoteId === null)
    .map(toGuestBoardRecord);
  writeRawCache(
    GUEST_BOARDS_KEY,
    JSON.stringify({
      version: GUEST_BOARDS_VERSION,
      boards: records,
      activeBoardId,
    }),
  );
}

export function clearGuestBoards(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(GUEST_BOARDS_KEY);
  } catch {
    // A stale key is cleaned on the next successful pass.
  }
}
