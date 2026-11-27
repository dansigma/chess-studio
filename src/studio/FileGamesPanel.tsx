"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DeleteFileGameDialog, type FileGameDeleteTarget } from "./DeleteFileGameDialog";
import { LibraryLoadingStatus } from "./library/LibraryLoadingStatus";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { openBoardPanel } from "./dock-api";
import { GameOpenRow } from "./GameOpenRow";
import { selectFileDatabase } from "./select-file-database";

export function FileGamesPanel({
  onGameSelect,
  mobile = false,
}: {
  onGameSelect?: () => void;
  mobile?: boolean;
} = {}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const databaseId = useStudioStore((state) => state.activeFileDatabaseId);
  const gameId = useStudioStore((state) => state.activeFileGameId);
  const filesHydrated = useStudioStore((state) => state.filesHydrated);
  const databases = useStudioStore((state) => state.files.databases);
  const openFileGame = useStudioStore((state) => state.openFileGame);
  const [deleting, setDeleting] = useState<FileGameDeleteTarget | null>(null);
  const database = selectFileDatabase(databases, databaseId);

  if (!filesHydrated) return <LibraryLoadingStatus />;

  if (!database) {
    return (
      <div className="flex h-full items-center px-3 text-dense text-studio-faint">
        {tPanels(locale, "files.openHint")}
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
          <div className="px-3 py-4 text-studio-faint">{tPanels(locale, "files.empty")}</div>
        ) : null}
        {database.games.map((game) => (
          <div key={game.id} className="flex items-stretch">
            <GameOpenRow
              previewEnabled={!mobile}
              className={`flex min-w-0 flex-1 justify-between gap-2 px-3 text-left hover:bg-studio-hover-subtle ${
                mobile ? "min-h-[44px] items-center py-2" : "items-baseline py-1.5"
              } ${
                game.id === gameId ? "bg-studio-selected" : ""
              }`}
              onOpen={() => {
                openFileGame(game, { databaseId: database.id });
                onGameSelect?.();
              }}
              onOpenNew={() => {
                openFileGame(game, { openInNewBoard: true, databaseId: database.id });
                const active = selectActiveBoard(useStudioStore.getState());
                openBoardPanel(active.id, active.title);
                onGameSelect?.();
              }}
            >
              <span className="min-w-0 flex-1 truncate">{game.title}</span>
              {game.date ? (
                <span className="shrink-0 text-studio-faint">{game.date}</span>
              ) : null}
            </GameOpenRow>
            <button
              type="button"
              className="flex min-w-8 shrink-0 items-center justify-center text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg focus-visible:outline-2 focus-visible:outline-studio-accent"
              aria-label={tPanels(locale, "files.deleteGame")}
              title={tPanels(locale, "files.deleteGame")}
              onClick={() => setDeleting({ databaseId: database.id, gameId: game.id, title: game.title })}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      {deleting && <DeleteFileGameDialog target={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
