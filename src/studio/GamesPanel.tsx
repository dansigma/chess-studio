"use client";

import { useStudioStore } from "@/src/store/studio-store";
import { explorerGamesTitle, type ExplorerGameRow } from "@/src/lib/explorer-types";

function ResultMark({ winner }: { winner: ExplorerGameRow["winner"] }) {
  if (winner === "white") {
    return <span className="text-studio-fg">1-0</span>;
  }
  if (winner === "black") {
    return <span className="text-studio-muted">0-1</span>;
  }
  return <span className="text-studio-faint">½-½</span>;
}

export function GamesPanel() {
  const explorer = useStudioStore((state) => state.explorer);
  const loading = useStudioStore((state) => state.explorerLoading);
  const openListedGame = useStudioStore((state) => state.openListedGame);
  const setStatus = useStudioStore((state) => state.setStatus);
  const source = useStudioStore((state) => state.databaseSource);
  const databases = useStudioStore((state) => state.files.databases);

  async function openGame(game: ExplorerGameRow) {
    setStatus("Loading game…");
    try {
      if (game.pgn) {
        openListedGame({
          pgn: game.pgn,
          title: `${game.whiteName} vs ${game.blackName}`,
          atFen: explorer?.fen,
        });
        setStatus(null);
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
      });
      setStatus(null);
    } catch {
      setStatus("Could not load that game.");
    }
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2 text-caption text-studio-faint">
        <span>Games · {explorerGamesTitle(source, databases)}</span>
        <span>{explorer?.games.length ?? 0} shown</span>
      </div>
      <div className="grid grid-cols-[44px_1fr_44px_1fr_44px_90px_40px] gap-2 border-b border-studio-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-wide text-studio-faint">
        <span>Res.</span>
        <span>White</span>
        <span></span>
        <span>Black</span>
        <span></span>
        <span>Event</span>
        <span>ECO</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? <div className="px-3 py-4 text-studio-faint">Loading games…</div> : null}
        {!loading && (explorer?.games.length ?? 0) === 0 ? (
          <div className="px-3 py-4 text-studio-faint">No games for this position.</div>
        ) : null}
        {explorer?.games.map((game) => (
          <button
            key={game.id}
            className="grid w-full grid-cols-[44px_1fr_44px_1fr_44px_90px_40px] items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover-subtle"
            onClick={() => void openGame(game)}
          >
            <ResultMark winner={game.winner} />
            <span className="truncate">{game.whiteName}</span>
            <span className="text-right text-studio-faint">{game.whiteRating ?? ""}</span>
            <span className="truncate">{game.blackName}</span>
            <span className="text-right text-studio-faint">{game.blackRating ?? ""}</span>
            <span className="truncate text-studio-muted">{game.event ?? ""}</span>
            <span className="text-studio-faint">{game.eco ?? ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
