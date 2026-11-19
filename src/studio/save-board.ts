import { persistBoard, useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { downloadTextFile } from "@/src/lib/download-file";
import { pgnFilename } from "@/src/lib/pgn-filename";
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
 * Saves the active board to the account; when signed out, downloads its PGN
 * with the sanitised suggested name and shows `chrome.status.savedPgnFile`.
 */
export async function saveActiveBoard(): Promise<void> {
  const state = useStudioStore.getState();
  const locale = state.settings.locale;
  try {
    const active = state.active();
    const remoteId = await persistBoard(active);
    if (!remoteId) {
      const filename = pgnFilename(boardTitle(locale, active.title), "board");
      downloadTextFile(filename, state.exportActivePgn());
      state.setStatus(tStudioChrome(locale, "chrome.status.savedPgnFile"));
      return;
    }
    useStudioStore.getState().markSaved(active.id, remoteId);
    useStudioStore.getState().setStatus(tStudioChrome(locale, "chrome.status.boardSaved"));
  } catch (error) {
    useStudioStore
      .getState()
      .setStatus(error instanceof Error ? error.message : tStudioChrome(locale, "chrome.status.saveFailed"));
  }
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
