import { importPgn } from "@/src/chess/pgn";
import { parsePgnCollection } from "@/src/chess/pgn-games";
import type { SiteLocale } from "@/src/i18n/locale";
import { tLibrary } from "@/src/i18n/library-strings";
import { getLibrarySource } from "@/src/lib/library/sources";
import type { LibraryGameItem } from "@/src/lib/library/types";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../dock-api";
import { useLibraryStore } from "./library-store";

async function loadPgn(item: LibraryGameItem): Promise<string> {
  const adapter = getLibrarySource(item.sourceId);
  if (!adapter) {
    throw new Error(item.sourceId);
  }
  return adapter.loadPgn(item.gameId, new AbortController().signal);
}

function reportFailure(cause: unknown, locale: SiteLocale): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  useStudioStore.setState({ statusMessage: tLibrary(locale, "library.table.openFailed", { message }) });
}

/** Loads the selected game's PGN for the shared destination dialog. */
export async function saveLibraryGameToDatabase(item: LibraryGameItem, locale: SiteLocale): Promise<void> {
  try {
    const pgn = await loadPgn(item);
    // A slower load must not swap the game under an already open dialog.
    if (!useStudioStore.getState().addToDatabaseOpen) {
      useStudioStore.getState().setAddToDatabaseOpen(true, pgn);
    }
  } catch (cause) {
    reportFailure(cause, locale);
  }
}

/** Loads the game's PGN through its source adapter and opens it in a new Studio board. */
export async function openLibraryGame(item: LibraryGameItem, locale: SiteLocale): Promise<void> {
  try {
    const pgn = await loadPgn(item);
    const game = parsePgnCollection(pgn, 1).games[0];
    if (!game) {
      throw new Error("PGN");
    }
    // SIG-1403: honour an active position filter so the board lands on the
    // searched ply; `openFileGame` falls back to move 0 when the FEN is off-tree.
    const atFen = useLibraryStore.getState().filters.position?.fen;
    const store = useStudioStore;
    store.getState().openFileGame(game, atFen ? { openInNewBoard: true, atFen } : { openInNewBoard: true });
    const active = selectActiveBoard(store.getState());
    openBoardPanel(active.id, active.title);
    // SIG-1403: the dock is hidden behind LibraryView, so opening a game must
    // bring the user to the board the same way `trainLibraryGame` does.
    store.getState().setWorkspaceView("studio");
  } catch (cause) {
    reportFailure(cause, locale);
  }
}

/**
 * SIG-1336: row action. Loads the PGN, opens the game from its first move in a
 * new Studio board and starts training there.
 */
export async function trainLibraryGame(item: LibraryGameItem, locale: SiteLocale): Promise<void> {
  try {
    const pgn = await loadPgn(item);
    const imported = importPgn(pgn);
    if (imported.tree.children.length === 0) {
      throw new Error("PGN");
    }
    const store = useStudioStore;
    store.getState().openListedGame({
      title: `${item.white} vs ${item.black}`,
      pgn,
      atFen: imported.tree.startFen,
      openInNewBoard: true,
    });
    const active = selectActiveBoard(store.getState());
    store.getState().setWorkspaceView("studio");
    openBoardPanel(active.id, active.title);
    store.getState().startTraining();
  } catch (cause) {
    reportFailure(cause, locale);
  }
}
