// SIG-1315: the Studio side of "Open in Studio" for a live game. Loads the round PGN from Lichess,
// picks the game and opens it on a new board, at the linked ply. It is a snapshot: the Studio tab
// does not keep following the game.
import { splitPgnGames } from "@/src/chess/pgn-games";
import { exportPgn, importPgn } from "@/src/chess/pgn";
import { getFenAt, type GameTree, type Path } from "@/src/chess/tree";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { fetchRoundPgn } from "@/src/lib/live/lichess-broadcast";
import { parseGame } from "@/src/lib/live/parse-game";
import { useStudioStore } from "@/src/store/studio-store";
import { boardTitle, openBoardPanel } from "../dock-api";
import { liveGameStudioHeaders, type LiveStudioLink } from "./live-studio-link";

/** Mainline path after `ply` moves (clamped to the game); the last move when `ply` is absent. */
function mainlinePath(tree: GameTree, ply: number | undefined): Path {
  const path: Path = [];
  for (let node = tree.children[0]; node && (ply === undefined || path.length < ply); node = node.children[0]) {
    path.push(0);
  }
  return path;
}

function showFailure(): void {
  const locale = useStudioStore.getState().settings.locale;
  useStudioStore.setState({ statusMessage: tStudioChrome(locale, "chrome.shell.liveGameFailed") });
}

/**
 * Opens the linked live game on a new Studio board. Resolves true once opened; false (with a status
 * message) when the round can't be loaded or doesn't hold the game. An aborted load does nothing.
 */
export async function openLiveStudioLink(link: LiveStudioLink, signal?: AbortSignal): Promise<boolean> {
  try {
    const text = await fetchRoundPgn(link.roundId, signal);
    if (text === null && signal?.aborted) {
      return false;
    }
    const game = (text ? splitPgnGames(text) : [])
      .map((chunk) => parseGame(chunk, link.roundId))
      .find((parsed) => parsed?.id === link.gameId);
    if (!game) {
      showFailure();
      return false;
    }
    const imported = importPgn(game.pgn);
    const headers = liveGameStudioHeaders({
      event: imported.headers.BroadcastName,
      site: imported.headers.BroadcastURL,
      white: game.white,
      black: game.black,
      result: game.result,
    });
    const path = mainlinePath(imported.tree, link.ply);
    const store = useStudioStore.getState();
    store.openListedGame({
      title: `${game.white.name} vs ${game.black.name}`,
      pgn: exportPgn(imported.tree, headers),
      atFen: getFenAt(imported.tree, path),
      openInNewBoard: true,
    });
    // `atFen` resolves to the first occurrence of a repeated position; pin the exact ply.
    store.goPath(path);
    const next = useStudioStore.getState();
    const active = next.active();
    openBoardPanel(active.id, boardTitle(next.settings.locale, active.title));
    return true;
  } catch {
    if (!signal?.aborted) {
      showFailure();
    }
    return false;
  }
}
