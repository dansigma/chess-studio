"use client";

import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "./dock-api";
import { GameOpenRow } from "./GameOpenRow";
import { selectFileDatabase } from "./select-file-database";

export function FileGamesPanel() {
  const databaseId = useStudioStore((state) => state.activeFileDatabaseId);
  const gameId = useStudioStore((state) => state.activeFileGameId);
  const databases = useStudioStore((state) => state.files.databases);
  const openFileGame = useStudioStore((state) => state.openFileGame);
  const database = selectFileDatabase(databases, databaseId);

  if (!database) {
    return (
      <div className="flex h-full items-center px-3 text-dense text-studio-faint">
        Open a PGN to list its games.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2 text-caption text-studio-faint">
        <span className="truncate">{database.name}</span>
        <span className="shrink-0">{database.games.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {database.games.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">No games in this file.</div>
        ) : null}
        {database.games.map((game) => (
          <GameOpenRow
            key={game.id}
            className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-studio-hover-subtle ${
              game.id === gameId ? "bg-studio-selected" : ""
            }`}
            onOpen={() => openFileGame(game)}
            onOpenNew={() => {
              openFileGame(game, { openInNewBoard: true });
              const active = selectActiveBoard(useStudioStore.getState());
              openBoardPanel(active.id, active.title);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{game.title}</span>
            {game.date ? (
              <span className="shrink-0 text-studio-faint">{game.date}</span>
            ) : null}
          </GameOpenRow>
        ))}
      </div>
    </div>
  );
}
