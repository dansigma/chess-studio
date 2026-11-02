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
