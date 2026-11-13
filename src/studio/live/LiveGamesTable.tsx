"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Clock, X } from "lucide-react";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { LiveGame } from "@/src/lib/live/types";
import { SearchInput } from "../ui/Controls";
import { pgnResultToWinner, ResultMark } from "../ResultMark";
import { outcomeFor } from "../ui/PlayerCell";
import { moveSelection } from "../library/library-columns";
import { useVirtualRows } from "../library/use-virtual-rows";
import { displayClockMs, formatDisplayClock, tickingSide, type Side } from "./live-clock";
import { sameGameRef, useLiveStore } from "./live-store";
import { LivePlayerCell } from "./LivePlayerCell";
import {
  countGames,
  filterGames,
  GAMES_FILTERS,
  GAMES_SORTS,
  isTypingTarget,
  searchGames,
  sortGames,
  type GamesFilter,
  type GamesSort,
} from "./live-games-filter";
import { liveStudioHref } from "./live-studio-link";
import { useLiveNow } from "./live-ticker";
import { loadTourGames } from "./live-tour-games";
import { cachedTourGames, type TourGameRow } from "./live-tour-cache";
import { useLiveRound, useLiveRoundInfo } from "./use-live";
import { useLiveTour } from "./use-live-tour";

const FILTER_LABEL = {
  all: "live.filter.all",
  ongoing: "live.filter.ongoing",
  finished: "live.filter.finished",
} as const;

export const LIVE_ROW_HEIGHT = 44;
const FLASH_MS = 1200;
// Open-board marker | White | (White clock | Result | Black clock) | Black. The fixed columns are sized
// for "1:23:45" so the names get the rest; the scroll pane never scrolls sideways (names truncate).
const GRID =
  "grid-cols-[1.25rem_minmax(0,1fr)_2.25rem_minmax(0,1fr)] sm:grid-cols-[1.25rem_minmax(0,1fr)_3.75rem_2.25rem_3.75rem_minmax(0,1fr)]";

const SORT_LABEL = { board: "live.sort.board", rating: "live.sort.rating" } as const;

/** Pure: whether a click (or Enter) opens the game in the Studio, in a new browser tab (Ctrl/Cmd) instead of the grid. */
export function isStudioOpenClick(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey;
}

/** SIG-1311: straight from the click (no request first, so it is not blocked as a pop-up); this tab keeps its stream. */
function openGameInStudio(roundId: string, gameId: string): void {
  window.open(liveStudioHref({ roundId, gameId }), "_blank", "noopener");
}

function TickingClock({ game, side }: { game: LiveGame; side: Side }) {
  const tick = useLiveNow();
  const ms = displayClockMs(game, side, tick);
  return <span data-clock-ticking="">{ms === null ? null : formatDisplayClock(ms)}</span>;
}

const CLOCK_CLASSES = {
  table: {
    toMove: "inline-flex items-center gap-1 font-semibold text-studio-fg",
    idle: "text-studio-muted",
  },
  board: {
    toMove: "inline-flex min-w-14 justify-center rounded-md bg-studio-fg px-2 py-0.5 font-semibold text-studio-bg",
    idle: "inline-flex min-w-14 justify-center rounded-md bg-studio-hover-strong px-2 py-0.5 text-studio-muted",
  },
} as const;

/**
 * Static unless `side` is the one to move in an ongoing game: only then it subscribes to the shared ticker.
 * The side to move is always the high-contrast one: bold with an accent dot in the table, an inverted
 * pill on the board cards.
 */
export function ClockCell({
  game,
  side,
  locale,
  variant = "table",
}: {
  game: LiveGame;
  side: Side;
  locale: SiteLocale;
  variant?: "table" | "board";
}) {
  const base = game[side].clockMs;
  if (base === null) {
    return <span className="text-caption text-studio-faint">{tLive(locale, "live.table.noClock")}</span>;
  }
  const toMove = tickingSide(game) === side;
  const classes = CLOCK_CLASSES[variant];
  return (
    <span
      className={toMove ? classes.toMove : classes.idle}
      data-to-move={toMove || undefined}
      title={toMove ? tLive(locale, "live.board.toMove") : undefined}
    >
      {toMove && variant === "table" ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-studio-accent" aria-hidden="true" />
      ) : null}
      {toMove ? <TickingClock game={game} side={side} /> : formatDisplayClock(base)}
    </span>
  );
}

function useMoveFlash(marker: string): boolean {
  const previous = useRef(marker);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (previous.current === marker) {
      return;
    }
    previous.current = marker;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [marker]);
  return flash;
}

function liveRowDomId(gameId: string): string {
  return `live-row-${gameId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

type RowProps = {
  game: LiveGame;
  index: number;
  /** 1-based position in the grid when the game is open there, else null. */
  gridNumber: number | null;
  focused: boolean;
  active: boolean;
  /** "All rounds": the name of the game's round, shown on the row. */
  roundName?: string;
  /** False for a game known only from the tournament PGN: it has no clock yet (it gets one once opened). */
  clocks?: boolean;
  locale: SiteLocale;
  onActivate: (game: LiveGame, studio: boolean) => void;
  onClose: (game: LiveGame) => void;
};

const LiveRow = memo(function LiveRow({
  game,
  index,
  gridNumber,
  focused,
  active,
  roundName,
  clocks = true,
  locale,
  onActivate,
  onClose,
}: RowProps) {
  const open = gridNumber !== null;
  // Rows flash when a move arrives; `motion-safe` keeps it off for prefers-reduced-motion.
  const flash = useMoveFlash(`${game.fen}|${game.lastMoveUci ?? ""}`);
  const winner = pgnResultToWinner(game.result);
  const background = flash
    ? "motion-safe:bg-studio-hover-strong"
    : focused
      ? "bg-studio-selected"
      : open
        ? "bg-studio-hover-subtle"
        : "";
  // On narrow screens the clocks move under the names (second line of the player cell).
  const narrowClock = (side: Side) => (
    <span className="tabular-nums sm:hidden">
      {clocks ? <ClockCell game={game} side={side} locale={locale} /> : null}
    </span>
  );
  const roundTag = roundName ? (
    <span className="min-w-0 truncate text-studio-faint" data-live-round-name="" title={roundName}>
      {roundName}
    </span>
  ) : null;
  return (
    <div
      id={liveRowDomId(game.id)}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={focused || open}
      data-live-row={game.id}
      data-open={open || undefined}
      data-focused={focused || undefined}
      data-active={active || undefined}
      className={`group/row grid cursor-pointer items-center gap-x-1.5 px-2 transition-colors duration-700 hover:bg-studio-hover hover:duration-75 ${GRID} ${background} ${
        active ? "outline outline-1 -outline-offset-1 outline-studio-accent" : ""
      }`}
      style={{ height: LIVE_ROW_HEIGHT }}
      title={open ? tLive(locale, "live.table.open") : tLive(locale, "live.table.hint")}
      onClick={(event: MouseEvent) => onActivate(game, isStudioOpenClick(event))}
    >
      <div role="cell" className="relative flex h-5 justify-center" data-live-open-marker={open || undefined}>
        {open ? (
          <>
            {/* The grid position; on hover the whole marker turns into the close button. */}
            <span
              data-live-grid-number=""
              title={tLive(locale, "live.table.open")}
              className={`flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-bold leading-none tabular-nums group-hover/row:opacity-0 ${
                focused ? "bg-studio-accent text-studio-accent-fg" : "bg-studio-accent-soft text-studio-accent-text"
              }`}
            >
              {gridNumber}
            </span>
            <button
              type="button"
              tabIndex={-1}
              aria-label={tLive(locale, "live.board.close")}
              title={tLive(locale, "live.board.close")}
              data-live-row-close=""
              onClick={(event) => {
                event.stopPropagation();
                onClose(game);
              }}
              className="absolute inset-0 flex items-center justify-center rounded text-studio-muted opacity-0 hover:bg-studio-hover-strong hover:text-studio-fg focus-visible:opacity-100 group-hover/row:opacity-100"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
      <div role="cell" className="min-w-0">
        <LivePlayerCell
          player={game.white}
          outcome={outcomeFor(winner, "white")}
          emphasis={focused}
          shortName
          extra={
            <>
              {narrowClock("white")}
              {roundTag}
            </>
          }
        />
      </div>
      <div role="cell" className="hidden text-right text-dense tabular-nums sm:block">
        {clocks ? <ClockCell game={game} side="white" locale={locale} /> : null}
      </div>
      <div role="cell" className="flex justify-center">
        <ResultMark winner={winner} />
      </div>
      <div role="cell" className="hidden text-right text-dense tabular-nums sm:block">
        {clocks ? <ClockCell game={game} side="black" locale={locale} /> : null}
      </div>
      <div role="cell" className="min-w-0">
        <LivePlayerCell
          player={game.black}
          outcome={outcomeFor(winner, "black")}
          emphasis={focused}
          shortName
          extra={narrowClock("black")}
        />
      </div>
    </div>
  );
});

/** Games of the round, in the order Lichess sends them (board order). */
export function orderedGames(games: Record<string, LiveGame> | undefined): LiveGame[] {
  return games ? Object.values(games) : [];
}

type AllRoundsStatus = "idle" | "loading" | "error" | "ready";

/** A row known only from the tournament PGN, as a `LiveGame` (no position, no clocks). */
function tourRowGame(row: TourGameRow): LiveGame {
  return { ...row, fen: "", lastMoveUci: null, thinkTimeSec: null, pgn: null, updatedAt: 0 };
}

export function LiveGamesTable({ roundId, locale }: { roundId: string; locale: SiteLocale }) {
  const games = useLiveRound(roundId);
  const openBoards = useLiveStore((s) => s.openBoards);
  const focusedGame = useLiveStore((s) => s.focusedGame);
  const openBoard = useLiveStore((s) => s.openBoard);
  const closeBoard = useLiveStore((s) => s.closeBoard);
  const info = useLiveRoundInfo(roundId);
  const tourId = info?.tour.id ?? null;
  const gamesByRound = useLiveStore((s) => s.gamesByRound);
  const roundRows = useMemo(() => orderedGames(games), [games]);
  // Local state: the parent keys this component by round, so changing round resets search, filter and sort.
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GamesFilter>("all");
  const [sort, setSort] = useState<GamesSort>("board");
  // SIG-1314: off by default; turning it on is the only thing that requests the tournament's games.
  const [allRounds, setAllRounds] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tourRows, setTourRows] = useState<{ tourId: string; rows: TourGameRow[] } | null>(null);
  const [tourFailed, setTourFailed] = useState(false);
  const tour = useLiveTour(allRounds ? tourId : null);
  useEffect(() => {
    if (!allRounds || !tourId) {
      return;
    }
    if (cachedTourGames(tourId)) {
      return;
    }
    let cancelled = false;
    loadTourGames(tourId).then(
      (rows) => !cancelled && setTourRows({ tourId, rows }),
      () => !cancelled && setTourFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [allRounds, tourId, attempt]);
  // The cache is read while rendering: a tournament fetched earlier in the session is ready at once, without a request.
  const tourGames =
    allRounds && tourId ? (cachedTourGames(tourId) ?? (tourRows?.tourId === tourId ? tourRows.rows : undefined)) : undefined;
  const tourReady = tourGames !== undefined;
  const status: AllRoundsStatus = !allRounds ? "idle" : tourReady ? "ready" : tourFailed ? "error" : "loading";
  const roundOrder = useMemo(() => new Map((tour?.rounds ?? []).map((r, i) => [r.id, i] as const)), [tour]);
  const roundNames = useMemo(() => {
    const names = new Map((tour?.rounds ?? []).map((r) => [r.id, r.name] as const));
    if (info) {
      names.set(info.round.id, info.round.name);
    }
    return names;
  }, [tour, info]);
  // The open round always comes from the live store (so its rows stay live); the other rounds from the tournament PGN.
  const allRows = useMemo(() => {
    if (!tourGames) {
      return roundRows;
    }
    const others = tourGames.filter((r) => r.roundId !== roundId).map((r) => gamesByRound[r.roundId]?.[r.id] ?? tourRowGame(r));
    // Stable: rounds in the tournament's order (unknown ones after, in PGN order), boards as they came.
    const rank = (g: LiveGame) => roundOrder.get(g.roundId) ?? Number.MAX_SAFE_INTEGER;
    return [...roundRows, ...others].sort((a, b) => rank(a) - rank(b));
  }, [tourGames, roundRows, roundId, gamesByRound, roundOrder]);
  // The search narrows the games first, so the status counts are the matches per status.
  const searched = useMemo(() => searchGames(allRows, query), [allRows, query]);
  const counts = useMemo(() => countGames(searched), [searched]);
  const rows = useMemo(() => sortGames(filterGames(searched, filter), sort), [searched, filter, sort]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { attachScroll, ...windowing } = useVirtualRows({ count: rows.length, rowHeight: LIVE_ROW_HEIGHT });
  const activeIndex = activeId === null ? -1 : rows.findIndex((g) => g.id === activeId);
  const roundOf = useCallback((game: LiveGame) => game.roundId || roundId, [roundId]);
  // The active row left the filter (it finished, or the filter changed): forget it (state adjusted during render).
  if (activeId !== null && activeIndex === -1) {
    setActiveId(null);
  }

  // "/" focuses the search field from anywhere in the round view, unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) {
        return;
      }
      if (isTypingTarget(event.target) || !searchRef.current) {
        return;
      }
      event.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Opens the game in the grid and focuses it, or (Ctrl/Cmd) in the Studio in a new browser tab.
  const activate = useCallback(
    (game: LiveGame, studio: boolean) => {
      if (studio) {
        openGameInStudio(roundOf(game), game.id);
      } else {
        openBoard({ roundId: roundOf(game), gameId: game.id });
      }
    },
    [openBoard, roundOf],
  );
  const onActivate = useCallback(
    (game: LiveGame, studio: boolean) => {
      setActiveId(game.id);
      activate(game, studio);
    },
    [activate],
  );
  const onClose = useCallback((game: LiveGame) => closeBoard({ roundId: roundOf(game), gameId: game.id }), [closeBoard, roundOf]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      const game = rows[activeIndex];
      if (game) {
        event.preventDefault();
        activate(game, isStudioOpenClick(event));
      }
      return;
    }
    const next = moveSelection(event.key, activeIndex, rows.length);
    const game = next === null ? undefined : rows[next];
    if (next === null || !game) {
      return;
    }
    event.preventDefault();
    setActiveId(game.id);
    windowing.scrollToIndex(next);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query === "") {
        event.currentTarget.blur();
      } else {
        setQuery("");
      }
    }
  }

  const visible = rows.slice(windowing.start, windowing.end);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-studio-border-subtle px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <SearchInput
            value={query}
            onChange={setQuery}
            inputRef={searchRef}
            onKeyDown={onSearchKeyDown}
            label={tLive(locale, "live.search.label")}
            placeholder={tLive(locale, "live.search.placeholder")}
            clearLabel={tLive(locale, "live.search.clear")}
            className="min-w-0 flex-1"
          />
          <select
            aria-label={tLive(locale, "live.sort.label")}
            value={sort}
            onChange={(event) => setSort(event.target.value as GamesSort)}
            className="h-[30px] shrink-0 rounded-md border border-studio-border bg-studio-panel px-2 text-dense text-studio-fg"
          >
            {GAMES_SORTS.map((o) => (
              <option key={o} value={o}>
                {tLive(locale, SORT_LABEL[o])}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-5 items-center gap-2 text-caption">
          <label className="flex cursor-pointer items-center gap-1.5 text-studio-muted">
            <input
              type="checkbox"
              role="switch"
              checked={allRounds}
              disabled={tourId === null}
              onChange={(event) => {
                setAllRounds(event.target.checked);
                setTourFailed(false);
              }}
              className="accent-studio-accent"
            />
            {tLive(locale, "live.allRounds.label")}
          </label>
          {status === "loading" ? (
            <span role="status" data-testid="live-all-rounds-loading" className="min-w-0 truncate text-studio-muted">
              {tLive(locale, "live.allRounds.loading")}
            </span>
          ) : null}
          {status === "error" ? (
            <span role="alert" data-testid="live-all-rounds-error" className="flex min-w-0 items-center gap-1.5 text-studio-muted">
              <span className="truncate">{tLive(locale, "live.allRounds.error")}</span>
              <button
                type="button"
                onClick={() => {
                  setTourFailed(false);
                  setAttempt((n) => n + 1);
                }}
                className="shrink-0 rounded px-1 text-studio-accent-text hover:bg-studio-hover-strong"
              >
                {tLive(locale, "live.allRounds.retry")}
              </button>
            </span>
          ) : null}
        </div>
        {/* One line at every width: the labels are short and never wrap. */}
        <div
          role="group"
          aria-label={tLive(locale, "live.filter.label")}
          className="flex w-full items-center gap-0.5 rounded-md bg-studio-selected p-0.5"
        >
          {GAMES_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`h-[22px] min-w-0 flex-1 truncate whitespace-nowrap rounded px-2 text-caption ${
                filter === f
                  ? "bg-studio-accent-soft font-medium text-studio-accent-text"
                  : "text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
              }`}
            >
              {tLive(locale, FILTER_LABEL[f])} ({counts[f]})
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p role="status" className="p-4 text-sm text-studio-muted" data-testid="live-filter-empty">
          {tLive(
            locale,
            query.trim() !== "" && counts.all === 0
              ? "live.filter.emptySearch"
              : filter === "finished"
                ? "live.filter.emptyFinished"
                : "live.filter.emptyOngoing",
          )}
        </p>
      ) : (
        <div
          role="table"
          aria-label={tLive(locale, "live.table.label")}
          aria-rowcount={rows.length + 1}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            role="row"
            className={`grid shrink-0 items-center gap-x-1.5 border-b border-studio-border-subtle px-2 py-1.5 text-caption font-medium text-studio-muted ${GRID}`}
          >
            <div role="columnheader" aria-label={tLive(locale, "live.table.open")} />
            <div role="columnheader" className="truncate">
              {tLive(locale, "live.table.white")}
            </div>
            {/* The clock and result columns are too narrow for words: an icon / short label, full name for AT and on hover. */}
            <div
              role="columnheader"
              aria-label={tLive(locale, "live.table.whiteClock")}
              title={tLive(locale, "live.table.whiteClock")}
              className="hidden justify-end sm:flex"
            >
              <Clock size={12} aria-hidden="true" />
            </div>
            <div role="columnheader" aria-label={tLive(locale, "live.table.result")} title={tLive(locale, "live.table.result")} className="text-center">
              {tLive(locale, "live.table.resultShort")}
            </div>
            <div
              role="columnheader"
              aria-label={tLive(locale, "live.table.blackClock")}
              title={tLive(locale, "live.table.blackClock")}
              className="hidden justify-end sm:flex"
            >
              <Clock size={12} aria-hidden="true" />
            </div>
            <div role="columnheader" className="truncate">
              {tLive(locale, "live.table.black")}
            </div>
          </div>
          <div
            ref={attachScroll}
            onScroll={windowing.onScroll}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="rowgroup"
            aria-activedescendant={activeIndex >= 0 ? liveRowDomId(rows[activeIndex]!.id) : undefined}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none focus-visible:ring-1 focus-visible:ring-studio-accent"
            data-testid="live-scroll"
          >
            <div style={{ height: windowing.totalHeight, position: "relative" }}>
              <div style={{ transform: `translateY(${windowing.offsetTop}px)` }}>
                {visible.map((game, offset) => {
                  const ref = { roundId: roundOf(game), gameId: game.id };
                  const position = openBoards.findIndex((b) => sameGameRef(b, ref));
                  return (
                    <LiveRow
                      key={game.id}
                      game={game}
                      index={windowing.start + offset}
                      gridNumber={position === -1 ? null : position + 1}
                      focused={sameGameRef(focusedGame, ref)}
                      active={game.id === activeId}
                      roundName={allRounds ? roundNames.get(game.roundId) : undefined}
                      clocks={!(allRounds && game.fen === "")}
                      locale={locale}
                      onActivate={onActivate}
                      onClose={onClose}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
