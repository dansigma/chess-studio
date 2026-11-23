"use client";

import { useState } from "react";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { explorerSourceTitle, type ExplorerGameRow } from "@/src/lib/explorer-types";
import { loadXdGamePgn } from "@/src/lib/xd-database/client";
import { formatYearMonth } from "@/src/lib/game-date";
import { openBoardPanel } from "./dock-api";
import { useExplorerData } from "./use-explorer-data";
import { lockedExplorerData, useLockablePosition } from "./use-lockable-position";
import { PositionLockButton } from "./PositionLockButton";
import { LibraryLoadingStatus } from "./library/LibraryLoadingStatus";
import { GameOpenRow } from "./GameOpenRow";
import { ResultMark } from "./ResultMark";
import { PlayerCell, outcomeFor } from "./ui/PlayerCell";

async function loadMastersPgn(id: string): Promise<string> {
  const response = await fetch(`/api/masters-pgn?id=${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("not found");
  return response.text();
}

export function GamesPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const sharedExplorer = useStudioStore((state) => state.explorer);
  const sharedLoading = useStudioStore((state) => state.explorerGamesLoading);
  const sharedError = useStudioStore((state) => state.explorerError);
  const sharedRetry = useStudioStore((state) => state.retryExplorer);
  const openListedGame = useStudioStore((state) => state.openListedGame);
  const setStatus = useStudioStore((state) => state.setStatus);
  const source = useStudioStore((state) => state.databaseSource);
  const filesHydrated = useStudioStore((state) => state.filesHydrated);
  const databases = useStudioStore((state) => state.files.databases);
  const setActivity = useStudioStore((state) => state.setActivity);
  // SIG-1455: the shared feed always follows the board, so a locked Games
  // panel runs its own query for the locked FEN until it is unlocked.
  const position = useLockablePosition();
  const [retryTick, setRetryTick] = useState(0);
  const own = useExplorerData(source, retryTick, true, position.fen, position.locked);
  const explorer = position.locked ? lockedExplorerData(own.explorer, sharedExplorer, position.fen) : sharedExplorer;
  const loading = position.locked ? own.gamesLoading : sharedLoading;
  const explorerError = position.locked ? own.error : sharedError;
  const retryExplorer = position.locked ? () => setRetryTick((count) => count + 1) : sharedRetry;

  // SIG-1192: masters/online rows carry no event name, so the column is
  // only shown when at least one listed game has one (curated, personal).
  const xd = source === "xadrez-digital";
  const error = xd && explorerError;
  const games = xd && (loading || error || explorer?.source !== source) ? [] : explorer?.games ?? [];
  const showEvent = games.some((game) => Boolean(game.event));
  // SIG-1192: each rating lives inside its player's cell. As separate
  // right-aligned columns, White's rating sat against Black's name and read
  // as Black's.
  const gridCols = showEvent
    ? "grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_56px_36px]"
    : "grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_56px_36px]";

  async function openGame(game: ExplorerGameRow, openInNewBoard = false) {
    setStatus(tPanels(locale, "games.loading"));
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
      const gameSource = explorer?.source ?? source;
      if (gameSource !== "masters" && gameSource !== "xadrez-digital") {
        setStatus(tPanels(locale, "games.noPgn"));
        return;
      }
      const pgn = gameSource === "xadrez-digital" ? await loadXdGamePgn(game.id) : await loadMastersPgn(game.id);
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
      setStatus(tPanels(locale, "games.loadFailed"));
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

  if (!filesHydrated && source.startsWith("file:")) return <LibraryLoadingStatus />;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2 text-caption text-studio-faint">
        {/* SIG-1192: name the source, not the tab ("Games · Games" before). */}
        <span>{tPanels(locale, "games.title", { name: explorerSourceTitle(source, databases, locale) })}</span>
        <span className="flex items-center gap-1">
          {games.length === 1
            ? tPanels(locale, "games.shown.one", { count: games.length })
            : tPanels(locale, "games.shown.other", { count: games.length })}
          <PositionLockButton position={position} locale={locale} />
        </span>
      </div>
      <div className={`grid ${gridCols} gap-x-3 border-b border-studio-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-wide text-studio-faint`}>
        <span>{tPanels(locale, "games.column.result")}</span>
        <span>{tPanels(locale, "games.column.white")}</span>
        <span>{tPanels(locale, "games.column.black")}</span>
        {showEvent ? <span>{tPanels(locale, "games.column.event")}</span> : null}
        <span>{tPanels(locale, "games.column.date")}</span>
        <span>{tPanels(locale, "games.column.eco")}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading || undefined}>
        {loading ? (
          <div className="px-3 py-4 text-studio-faint" role="status">
            {tPanels(locale, "games.loadingGames")}
          </div>
        ) : null}
        {!loading && error ? (
          <div className="px-3 py-4 text-studio-faint" role="alert">
            {tPanels(locale, "explorer.error")}{" "}
            <button type="button" className="underline" onClick={retryExplorer}>
              {tPanels(locale, "explorer.errorRetry")}
            </button>
          </div>
        ) : null}
        {!loading && !error && games.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4 text-studio-faint">
            <p>{tPanels(locale, "games.empty")}</p>
            {/* SIG-1385: the empty row points at the import flow — same
                `setActivity("mygames")` the activity bar uses to open My Games. */}
            <button
              type="button"
              onClick={() => setActivity("mygames")}
              className="rounded bg-studio-hover px-2 py-0.5 text-caption font-medium text-studio-accent-text hover:bg-studio-hover-strong"
            >
              {tPanels(locale, "games.import")}
            </button>
          </div>
        ) : null}
        {games.map((game) => (
          <GameOpenRow
            key={game.id}
            className={`grid w-full ${gridCols} items-center gap-x-3 px-3 py-1.5 text-left hover:bg-studio-hover`}
            onOpen={() => void openGame(game)}
            onOpenNew={() => void openGame(game, true)}
          >
            <ResultMark winner={game.winner} />
            <PlayerCell name={game.whiteName} rating={game.whiteRating} outcome={outcomeFor(game.winner, "white")} />
            <PlayerCell name={game.blackName} rating={game.blackRating} outcome={outcomeFor(game.winner, "black")} />
            {showEvent ? <span className="truncate text-studio-muted">{game.event ?? ""}</span> : null}
            <span className="truncate tabular-nums text-studio-faint">{formatYearMonth(game.year, game.month)}</span>
            <span className="font-medium tabular-nums text-studio-muted">{game.eco ?? ""}</span>
          </GameOpenRow>
        ))}
      </div>
    </div>
  );
}
