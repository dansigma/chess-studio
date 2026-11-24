import type { SiteLocale } from "@/src/i18n/locale";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import { loadXdGamePgn } from "@/src/lib/xd-database/client";
import { useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "./dock-api";

export function revealActiveBoard(): void {
  const { id, title } = useStudioStore.getState().active();
  openBoardPanel(id, title);
}

export async function openXdGame(
  { id, ...board }: { id: string; title: string; atFen?: string; openInNewBoard: boolean },
  locale: SiteLocale,
): Promise<void> {
  const { openListedGame, setStatus } = useStudioStore.getState();
  setStatus(tPanels(locale, "games.loading"));
  try {
    const pgn = await loadXdGamePgn(id);
    openListedGame({ ...board, pgn });
    setStatus(null);
    revealActiveBoard();
  } catch {
    setStatus(tPanels(locale, "games.loadFailed"));
  }
}
