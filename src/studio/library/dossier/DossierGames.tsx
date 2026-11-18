"use client";

// SIG-1342: the dossier's Games area. Lists the player's filtered games
// newest first, optionally narrowed to the opening selected in the dossier,
// and opens the shared Library preview under the list.
import { memo, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { importPgn } from "@/src/chess/pgn";
import { numberSanLine } from "@/src/chess/pgn-clean";
import { formatInteger } from "@/src/i18n/format";
import { tLibrary } from "@/src/i18n/library-strings";
import { openingGroupKey } from "@/src/lib/prep/opening-group";
import type { PlayerGame } from "@/src/lib/player-types";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../../dock-api";
import { ResultMark } from "../../ResultMark";
import { Button } from "../../ui/Button";
import { EcoBadge } from "../../ui/EcoBadge";
import { outcomeFor, PlayerCell } from "../../ui/PlayerCell";
import { Panel } from "../../ui/Panel";
import { moveSelection } from "../library-columns";
import { GamePreview } from "../LibraryPreview";
import { useDossierStore } from "./dossier-store";

const ROW_HEIGHT = 28;
// SIG-1405: the list grows in pages inside the dossier's own scroll instead of
// a nested scrollbox. A page keeps the DOM small for players with thousands of
// games and keeps the preview (rendered under the list) close to the rows.
export const DOSSIER_GAMES_PAGE = 25;
const GRID_TEMPLATE = "minmax(0,1fr) minmax(0,1fr) 36px 3ch 34px minmax(0,0.8fr)";

/** Newest first; undated games last, then by id so the order is stable. */
export function compareDossierGames(a: PlayerGame, b: PlayerGame): number {
  if (a.playedAt !== b.playedAt) {
    if (a.playedAt === null) {
      return 1;
    }
    if (b.playedAt === null) {
      return -1;
    }
    return b.playedAt - a.playedAt;
  }
  return a.id.localeCompare(b.id);
}

function resultToken(winner: PlayerGame["winner"]): "1-0" | "0-1" | "1/2-1/2" | "*" {
  if (winner === "white") {
    return "1-0";
  }
  if (winner === "black") {
    return "0-1";
  }
  if (winner === "draw") {
    return "1/2-1/2";
  }
  return "*";
}

/** The stored PGN, or a minimal one built from the moves (Lichess often has only `moves`). */
export function dossierGamePgn(game: PlayerGame): string {
  if (game.pgn?.trim()) {
    return game.pgn;
  }
  const movetext = numberSanLine(game.moves?.trim() ?? "");
  return `${movetext}${movetext ? " " : ""}${resultToken(game.winner)}\n`;
}

function gameYear(game: PlayerGame): number | null {
  if (game.year != null) {
    return game.year;
  }
  return game.playedAt != null ? new Date(game.playedAt).getUTCFullYear() : null;
}

/** Display name of the opening filter: its first game's opening, then its ECO, then the key. */
function openingFilterLabel(games: readonly PlayerGame[], key: string): string {
  const first = games.find((game) => openingGroupKey(game) === key);
  return first?.opening?.trim() || first?.eco?.trim() || key;
}

type DossierGameRowProps = {
  game: PlayerGame;
  index: number;
  total: number;
  selected: boolean;
  domId: string;
  onSelect: (game: PlayerGame) => void;
  onOpen: (game: PlayerGame) => void;
};

/**
 * SIG-1405: one row of the games list. Memoized because the list is no longer
 * virtualized: the dossier is the only scroll container, so every row is in
 * the DOM and only the selected row's props change on selection. Rows also
 * skip layout/paint while offscreen (`content-visibility`), which keeps long
 * local lists affordable.
 */
function rowDomId(id: string): string {
  return `dossier-game-row-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

const DossierGameRow = memo(function DossierGameRow({
  game,
  index,
  total,
  selected,
  domId,
  onSelect,
  onOpen,
}: DossierGameRowProps) {
  const year = gameYear(game);
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={total}
      data-testid="dossier-game-row"
      className={`group relative grid cursor-default items-center gap-2 px-2 [content-visibility:auto] [contain-intrinsic-size:28px] ${
        selected ? "bg-studio-selected" : "hover:bg-studio-hover-subtle"
      }`}
      style={{ gridTemplateColumns: GRID_TEMPLATE, height: ROW_HEIGHT }}
      onClick={() => onSelect(game)}
      onDoubleClick={() => onOpen(game)}
    >
      {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-studio-accent" /> : null}
      <PlayerCell
        name={game.whiteName}
        rating={game.whiteRating}
        outcome={outcomeFor(game.winner, "white")}
        emphasis={game.color === "white"}
      />
      <PlayerCell
        name={game.blackName}
        rating={game.blackRating}
        outcome={outcomeFor(game.winner, "black")}
        emphasis={game.color === "black"}
      />
      <ResultMark winner={game.winner} />
      <EcoBadge code={game.eco} opening={game.opening} />
      <span className="text-right tabular-nums text-studio-faint">{year ?? "—"}</span>
      <span className="truncate text-studio-muted" title={game.event ?? undefined}>
        {game.event ?? "—"}
      </span>
    </div>
  );
});

export function DossierGames({ games }: { games: PlayerGame[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const openListedGame = useStudioStore((state) => state.openListedGame);
  const setWorkspaceView = useStudioStore((state) => state.setWorkspaceView);
  const player = useDossierStore((state) => state.player);
  const selectedOpening = useDossierStore((state) => state.selectedOpening);
  const clearOpening = useDossierStore((state) => state.clearOpening);

  const sorted = useMemo(() => [...games].sort(compareDossierGames), [games]);
  const filtered = useMemo(
    () =>
      selectedOpening === null
        ? sorted
        : sorted.filter((game) => openingGroupKey(game) === selectedOpening),
    [sorted, selectedOpening],
  );
  const chipLabel = selectedOpening === null ? null : openingFilterLabel(sorted, selectedOpening);

  // Selection is scoped to the player: a new dossier or a filtered-out game
  // clears it without an effect on the list.
  const [selection, setSelection] = useState<{ playerId: string; gameId: string } | null>(null);
  const playerId = player?.id ?? null;
  const selectedIndex =
    selection && playerId !== null && selection.playerId === playerId
      ? filtered.findIndex((game) => game.id === selection.gameId)
      : -1;
  const selectedGame = selectedIndex >= 0 ? filtered[selectedIndex] ?? null : null;

  // Drop a selection the player change or the filters left out of the list.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the selection is a cache keyed to the visible list, not a render input.
    setSelection((current) =>
      current && current.playerId === playerId && filtered.some((game) => game.id === current.gameId)
        ? current
        : null,
    );
  }, [playerId, filtered]);

  // Rows shown: one page per "Load more" click, reset when the player or the
  // opening filter changes, and always far enough to include the selection
  // (ArrowDown past the last row reveals the next one).
  const pageScope = `${playerId ?? ""}|${selectedOpening ?? ""}`;
  const [page, setPage] = useState<{ scope: string; count: number }>({ scope: pageScope, count: DOSSIER_GAMES_PAGE });
  const pageCount = page.scope === pageScope ? page.count : DOSSIER_GAMES_PAGE;
  const shownCount = Math.min(filtered.length, Math.max(pageCount, selectedIndex + 1));
  const shown = filtered.slice(0, shownCount);

  // Keep the selected row visible inside the dossier's scroll (keyboard steps,
  // including onto a row that only now became part of the list).
  const selectedId = selectedGame?.id ?? null;
  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    // Optional call: jsdom has no layout and no scrollIntoView.
    document.getElementById(rowDomId(selectedId))?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  const preview = useMemo(() => {
    if (!selectedGame) {
      return null;
    }
    const pgn = dossierGamePgn(selectedGame);
    return { pgn, game: importPgn(pgn) };
  }, [selectedGame]);

  const selectGame = useCallback(
    (game: PlayerGame) => {
      if (playerId === null) {
        return;
      }
      setSelection({ playerId, gameId: game.id });
    },
    [playerId],
  );

  const openInStudioGame = useCallback(
    (game: PlayerGame) => {
      const pgn = dossierGamePgn(game);
      const imported = importPgn(pgn);
      openListedGame({
        title: `${game.whiteName} vs ${game.blackName}`,
        pgn,
        atFen: imported.tree.startFen,
        openInNewBoard: true,
      });
      const active = selectActiveBoard(useStudioStore.getState());
      setWorkspaceView("studio");
      openBoardPanel(active.id, active.title);
    },
    [openListedGame, setWorkspaceView],
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      if (selectedGame) {
        event.preventDefault();
        openInStudioGame(selectedGame);
      }
      return;
    }
    const next = moveSelection(event.key, selectedIndex, filtered.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    const game = filtered[next];
    if (game) {
      // The effect on `selectedId` scrolls the row into view.
      selectGame(game);
    }
  }

  return (
    <Panel
      as="section"
      aria-label={tLibrary(locale, "library.dossier.gamesList")}
      className="flex min-h-0 min-w-0 flex-col gap-2 p-2"
      data-testid="dossier-games"
    >
      <h3 className="text-caption font-semibold text-studio-muted">
        {tLibrary(locale, "library.dossier.gamesList")}
      </h3>
      {chipLabel !== null && selectedOpening !== null ? (
        <span
          data-testid="dossier-opening-chip"
          className="inline-flex h-[22px] max-w-full items-center gap-1 self-start rounded-full border border-transparent bg-studio-accent-soft pl-2 pr-1 text-caption text-studio-accent-text"
        >
          <span className="truncate">{chipLabel}</span>
          <button
            type="button"
            aria-label={tLibrary(locale, "library.dossier.removeOpening", { name: chipLabel })}
            onClick={clearOpening}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-studio-hover-strong"
          >
            <X size={10} />
          </button>
        </span>
      ) : null}
      {filtered.length === 0 ? (
        <p
          role="status"
          className="rounded border border-studio-border-subtle p-2 text-dense text-studio-muted"
          data-testid="dossier-games-empty"
        >
          {tLibrary(locale, "library.dossier.gamesEmpty")}
        </p>
      ) : (
        <>
          <div
            role="listbox"
            tabIndex={0}
            aria-label={tLibrary(locale, "library.dossier.gamesList")}
            aria-activedescendant={selectedGame ? rowDomId(selectedGame.id) : undefined}
            onKeyDown={onKeyDown}
            className="min-w-0 text-dense text-studio-fg outline-none focus-visible:ring-1 focus-visible:ring-studio-accent"
            data-testid="dossier-games-scroll"
          >
            {shown.map((game, index) => (
              <DossierGameRow
                key={game.id}
                game={game}
                index={index}
                total={filtered.length}
                selected={game.id === selectedGame?.id}
                domId={rowDomId(game.id)}
                onSelect={selectGame}
                onOpen={openInStudioGame}
              />
            ))}
          </div>
          {shownCount < filtered.length ? (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              data-testid="dossier-games-more"
              onClick={() => setPage({ scope: pageScope, count: shownCount + DOSSIER_GAMES_PAGE })}
            >
              {tLibrary(locale, "library.loadMore")} ({formatInteger(locale, filtered.length - shownCount)})
            </Button>
          ) : null}
          {selectedGame && preview ? (
            <div className="min-h-0 min-w-0 flex-1 border-t border-studio-border-subtle pt-2">
              <GamePreview
                key={selectedGame.id}
                white={selectedGame.whiteName}
                black={selectedGame.blackName}
                whiteElo={selectedGame.whiteRating}
                blackElo={selectedGame.blackRating}
                result={resultToken(selectedGame.winner)}
                eco={selectedGame.eco}
                opening={selectedGame.opening}
                event={selectedGame.event}
                date={selectedGame.year != null ? String(selectedGame.year) : null}
                pgn={preview.pgn}
                game={preview.game}
                orientation={selectedGame.color}
              />
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
