import { saveGuestBoards } from "./guest-boards";
import { saveSessionBoards } from "./session-boards";
import { markBoardClosedRecord } from "./studio-persistence";
import type { BoardSession } from "@/src/store/slices/types";

// SIG-1199: closing a board updates persisted state immediately instead of
// waiting for the debounced shell effects (a reload inside the debounce window
// restored the closed board). Guests rewrite their local snapshot; accounts
// rewrite the per-user snapshot and stamp the remote row closed (never delete:
// the row is the only copy of the user's PGN and repertoire mark).
export function persistBoardClose(
  state: { user: { id: string } | null; boards: BoardSession[]; activeBoardId: string },
  closed: BoardSession | undefined,
  markClosed: (remoteId: string | null, userId: string | null) => Promise<void> = markBoardClosedRecord,
): void {
  if (!state.user) {
    saveGuestBoards(state.boards, state.activeBoardId);
    return;
  }
  saveSessionBoards(state.user.id, state.boards, state.activeBoardId);
  if (closed?.remoteId) {
    void markClosed(closed.remoteId, state.user.id).catch(() => undefined);
  }
}
