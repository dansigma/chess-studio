import { persistBoard, useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { downloadTextFile } from "@/src/lib/download-file";
import { pgnFilename } from "@/src/lib/pgn-filename";
import { saveBoardNow } from "@/src/lib/studio-autosave";
import { exportPgn } from "@/src/chess/pgn";
import { boardTitle } from "./dock-api";

type SaveFilePickerHandle = {
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
  name?: string;
};

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<SaveFilePickerHandle>;

/** Suggested `.pgn` file name for the active board, localised and sanitised. */
export function suggestedActivePgnFilename(): string {
  const state = useStudioStore.getState();
  const locale = state.settings.locale;
  const active = state.active();
  return pgnFilename(boardTitle(locale, active.title), "board");
}

/**
 * Saves the active board to the account through the autosave's per-board
 * path (`saveBoardNow`): it waits for a save already running on the board,
 * and an edit made during the round-trip is saved too instead of being
 * marked saved unsent. When signed out, downloads the board's PGN with the
 * sanitised suggested name and shows `chrome.status.savedPgnFile`.
 */
export async function saveActiveBoard(): Promise<void> {
  const state = useStudioStore.getState();
  const locale = state.settings.locale;
  const active = state.active();
  const outcome = await saveBoardNow(active.id, {
    getBoards: () => useStudioStore.getState().boards,
    persist: (board) => persistBoard(board),
    markSaved: (id, remoteId) => useStudioStore.getState().markSaved(id, remoteId),
  });
  const setStatus = useStudioStore.getState().setStatus;
  if (outcome === "declined") {
    const board = useStudioStore.getState().boards.find((item) => item.id === active.id) ?? active;
    downloadTextFile(pgnFilename(boardTitle(locale, board.title), "board"), exportPgn(board.tree, board.headers));
    setStatus(tStudioChrome(locale, "chrome.status.savedPgnFile"));
  } else if (outcome === "saved") {
    setStatus(tStudioChrome(locale, "chrome.status.boardSaved"));
  } else if (outcome === "failed") {
    setStatus(tStudioChrome(locale, "chrome.status.saveFailed"));
  }
  // "deferred": edits kept landing mid-save; the autosave finishes the job.
  // "closed": the board was closed meanwhile; nothing to report.
}

/**
 * Opens the native save-file picker when available, writing the active board's
 * PGN on confirm (or staying silent on `AbortError`). Falls back to the
 * Save-as modal when the picker is unavailable or fails for another reason.
 */
export async function saveActiveBoardAs(): Promise<void> {
  const suggestedName = suggestedActivePgnFilename();
  const picker =
    typeof window !== "undefined"
      ? (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
      : undefined;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: "PGN", accept: { "application/x-chess-pgn": [".pgn"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(useStudioStore.getState().exportActivePgn());
      await writable.close();
      const savedName = handle.name || suggestedName;
      const locale = useStudioStore.getState().settings.locale;
      useStudioStore.getState().setStatus(tStudioChrome(locale, "chrome.status.savedAs", { name: savedName }));
      return;
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
        return;
      }
    }
  }

  useStudioStore.getState().setSaveAsOpen(true);
}
