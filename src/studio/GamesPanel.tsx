"use client";

import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { explorerGamesTitle, type ExplorerGameRow } from "@/src/lib/explorer-types";
import { formatYearMonth } from "@/src/lib/game-date";
import { openBoardPanel } from "./dock-api";
import { GameOpenRow } from "./GameOpenRow";
import { ResultMark } from "./ResultMark";

export function GamesPanel() {
  const explorer = useStudioStore((state) => state.explorer);
  const loading = useStudioStore((state) => state.explorerLoading);
  const openListedGame = useStudioStore((state) => state.openListedGame);
  const setStatus = useStudioStore((state) => state.setStatus);
  const source = useStudioStore((state) => state.databaseSource);
  const databases = useStudioStore((state) => state.files.databases);

  async function openGame(game: ExplorerGameRow, openInNewBoard = false) {
    setStatus("Loading game…");
    try {
      if (game.pgn) {
        openListedGame({
          pgn: game.pgn,
          title: `${game.whiteName} vs ${game.blackName}`,
          atFen: explorer?.fen,
          openInNewBoard,
        });
        setStatus(null);
        // SIG-911: the load activates a board session in the store, so reveal
        // its `board:*` panel too — otherwise the game sits on an invisible
        // board and notation navigation looks frozen.
        revealActiveBoard();
        return;
      }
      if (source !== "masters") {
        setStatus("This game has no stored PGN.");
        return;
      }
      const response = await fetch(`/api/masters-pgn?id=${encodeURIComponent(game.id)}`);
      if (!response.ok) {
        throw new Error("not found");
      }
      const pgn = await response.text();
      openListedGame({
        pgn,
        title: `${game.whiteName} vs ${game.blackName}`,
        atFen: explorer?.fen,
        openInNewBoard,
      });
      setStatus(null);
      // SIG-911: same reveal as the inline-PGN path above.
      revealActiveBoard();
    } catch {
      setStatus("Could not load that game.");
    }
  }

  // SIG-911: reveal the session the load just activated — the preview board in
  // preview mode, or the independent board opened via double-click/Shift+Enter.
  // Supersedes SIG-910's conditional openSideBySide: the load always leaves the
  // target session active, so an unconditional reveal covers both cases.
  function revealActiveBoard(): void {
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2 text-caption text-studio-faint">
        <span>Games · {explorerGamesTitle(source, databases)}</span>
        <span>{explorer?.games.length ?? 0} shown</span>
      </div>
      <div className="grid grid-cols-[44px_1fr_44px_1fr_44px_90px_64px_40px] gap-2 border-b border-studio-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-wide text-studio-faint">
        <span>Res.</span>
        <span>White</span>
        <span></span>
        <span>Black</span>
        <span></span>
        <span>Event</span>
        <span>Date</span>
        <span>ECO</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading || undefined}>
        {loading ? (
          <div className="px-3 py-4 text-studio-faint" role="status">
            Loading games…
          </div>
        ) : null}
        {!loading && (explorer?.games.length ?? 0) === 0 ? (
          <div className="px-3 py-4 text-studio-faint">No games for this position.</div>
        ) : null}
        {explorer?.games.map((game) => (
          <GameOpenRow
            key={game.id}
            className="grid w-full grid-cols-[44px_1fr_44px_1fr_44px_90px_64px_40px] items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover-subtle"
            onOpen={() => void openGame(game)}
            onOpenNew={() => void openGame(game, true)}
          >
            <ResultMark winner={game.winner} />
            <span className="truncate">{game.whiteName}</span>
            <span className="text-right text-studio-faint">{game.whiteRating ?? ""}</span>
            <span className="truncate">{game.blackName}</span>
            <span className="text-right text-studio-faint">{game.blackRating ?? ""}</span>
            <span className="truncate text-studio-muted">{game.event ?? ""}</span>
            <span className="truncate text-studio-faint">{formatYearMonth(game.year, game.month)}</span>
            <span className="text-studio-faint">{game.eco ?? ""}</span>
          </GameOpenRow>
        ))}
      </div>
    </div>
  );
}
