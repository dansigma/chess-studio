import { importPgn } from "@/src/chess/pgn";
import { parsePgnCollection } from "@/src/chess/pgn-games";
import type { SiteLocale } from "@/src/i18n/locale";
import { tLibrary } from "@/src/i18n/library-strings";
import { getLibrarySource } from "@/src/lib/library/sources";
import type { LibraryGameItem } from "@/src/lib/library/types";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../dock-api";

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

/** Loads the game's PGN through its source adapter and opens it in a new Studio board. */
export async function openLibraryGame(item: LibraryGameItem, locale: SiteLocale): Promise<void> {
  try {
    const pgn = await loadPgn(item);
    const game = parsePgnCollection(pgn, 1).games[0];
    if (!game) {
      throw new Error("PGN");
    }
    useStudioStore.getState().openFileGame(game, { openInNewBoard: true });
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
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
