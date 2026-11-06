// SIG-1244: applies what another screen handed to /studio (a course line or a
// puzzle via sessionStorage, or a shared-position FEN in the URL). It must run
// only once the account's board restore has settled: the restore replaces
// `boards` wholesale from the local snapshot and the Supabase rows, so a board
// opened earlier is silently dropped (signed in, the user then saw only the
// "Posição inicial" placeholder).
import { clearCourseStudyImport, fenFromShareSearch, readCourseStudyImport } from "@/src/chess/share-board";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { boardTitle, openBoardPanel } from "./dock-api";

/**
 * True once opening a board can no longer be overwritten by a restore: either
 * the session is a resolved guest (guest boards load synchronously) or the
 * signed-in restore has finished.
 */
export function entryImportReady(state: {
  authResolved: boolean;
  hasUser: boolean;
  restoreSettled: boolean;
}): boolean {
  return state.authResolved && (!state.hasUser || state.restoreSettled);
}

/** Consume the handoff exactly once (the payload is cleared before use). */
export function applyStudioEntryImport(search: string): void {
  const courseImport = readCourseStudyImport();
  if (courseImport) {
    clearCourseStudyImport();
    try {
      useStudioStore.getState().openListedGame({
        title: courseImport.title,
        pgn: courseImport.pgn,
        atFen: courseImport.atFen,
        openInNewBoard: true,
        orientation: courseImport.orientation,
      });
      // SIG-1247: give the new board its own dock tab (named after the import).
      // Without it the board had no `board:*` panel and the visible tab kept
      // the title of the game that was open before.
      const next = useStudioStore.getState();
      const active = next.active();
      openBoardPanel(active.id, boardTitle(next.settings.locale, active.title));
    } catch {
      const failedKey = courseImport.kind === "puzzle" ? "chrome.shell.puzzleLineFailed" : "chrome.shell.courseLineFailed";
      useStudioStore.setState({ statusMessage: tStudioChrome(useStudioStore.getState().settings.locale, failedKey) });
    }
    return;
  }
  const fen = fenFromShareSearch(search);
  if (fen) {
    useStudioStore.getState().openSharedPosition(fen);
  }
}
