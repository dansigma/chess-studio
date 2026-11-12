"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Clock } from "lucide-react";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { LiveGame } from "@/src/lib/live/types";
import { pgnResultToWinner, ResultMark } from "../ResultMark";
import { outcomeFor } from "../ui/PlayerCell";
import { moveSelection } from "../library/library-columns";
import { useVirtualRows } from "../library/use-virtual-rows";
import { displayClockMs, formatDisplayClock, tickingSide, type Side } from "./live-clock";
import { sameGameRef, useLiveStore } from "./live-store";
import { LivePlayerCell } from "./LivePlayerCell";
import { useLiveNow } from "./live-ticker";
import { useLiveRound } from "./use-live";

export const LIVE_ROW_HEIGHT = 44;
const FLASH_MS = 1200;
// Open-board marker | White | (White clock | Result | Black clock) | Black. The fixed columns are sized
// for "1:23:45" so the names get the rest; the scroll pane never scrolls sideways (names truncate).
const GRID =
  "grid-cols-[0.625rem_minmax(0,1fr)_2.25rem_minmax(0,1fr)] sm:grid-cols-[0.625rem_minmax(0,1fr)_3.75rem_2.25rem_3.75rem_minmax(0,1fr)]";

/** Pure: whether a click opens the game as another board (Ctrl/Cmd) instead of following it. */
export function isAddBoardClick(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey;
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
  open: boolean;
  focused: boolean;
  active: boolean;
  locale: SiteLocale;
  onActivate: (game: LiveGame, addBoard: boolean) => void;
};

const LiveRow = memo(function LiveRow({ game, index, open, focused, active, locale, onActivate }: RowProps) {
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
      <ClockCell game={game} side={side} locale={locale} />
    </span>
  );
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
      className={`grid cursor-pointer items-center gap-x-1.5 px-2 transition-colors duration-700 hover:bg-studio-hover hover:duration-75 ${GRID} ${background} ${
        active ? "outline outline-1 -outline-offset-1 outline-studio-accent" : ""
      }`}
      style={{ height: LIVE_ROW_HEIGHT }}
      title={open ? tLive(locale, "live.table.open") : tLive(locale, "live.table.hint")}
      onClick={(event: MouseEvent) => onActivate(game, isAddBoardClick(event))}
    >
      <div role="cell" className="flex justify-center" data-live-open-marker={open || undefined}>
        {open ? (
          <span
            aria-label={tLive(locale, "live.table.open")}
            className={`block h-2 w-2 rounded-full bg-studio-accent ${focused ? "ring-2 ring-studio-accent-soft" : ""}`}
          />
        ) : null}
      </div>
      <div role="cell" className="min-w-0">
        <LivePlayerCell
          player={game.white}
          outcome={outcomeFor(winner, "white")}
          emphasis={focused}
          extra={narrowClock("white")}
        />
      </div>
      <div role="cell" className="hidden text-right text-dense tabular-nums sm:block">
        <ClockCell game={game} side="white" locale={locale} />
      </div>
      <div role="cell" className="flex justify-center">
        <ResultMark winner={winner} />
      </div>
      <div role="cell" className="hidden text-right text-dense tabular-nums sm:block">
        <ClockCell game={game} side="black" locale={locale} />
      </div>
      <div role="cell" className="min-w-0">
        <LivePlayerCell
          player={game.black}
          outcome={outcomeFor(winner, "black")}
          emphasis={focused}
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

export function LiveGamesTable({ roundId, locale }: { roundId: string; locale: SiteLocale }) {
  const games = useLiveRound(roundId);
  const openBoards = useLiveStore((s) => s.openBoards);
  const focusedGame = useLiveStore((s) => s.focusedGame);
  const openBoard = useLiveStore((s) => s.openBoard);
  const rows = useMemo(() => orderedGames(games), [games]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { attachScroll, ...windowing } = useVirtualRows({ count: rows.length, rowHeight: LIVE_ROW_HEIGHT });
  const activeIndex = activeId === null ? -1 : rows.findIndex((g) => g.id === activeId);

  // The store focuses a board unless told otherwise, so "add" must pass `focus: false` explicitly.
  const follow = useCallback(
    (game: LiveGame, addBoard: boolean) => openBoard({ roundId, gameId: game.id }, { focus: !addBoard }),
    [openBoard, roundId],
  );
  const onActivate = useCallback(
    (game: LiveGame, addBoard: boolean) => {
      setActiveId(game.id);
      follow(game, addBoard);
    },
    [follow],
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      const game = rows[activeIndex];
      if (game) {
        event.preventDefault();
        follow(game, isAddBoardClick(event));
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

  const visible = rows.slice(windowing.start, windowing.end);
  return (
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
              const ref = { roundId, gameId: game.id };
              return (
                <LiveRow
                  key={game.id}
                  game={game}
                  index={windowing.start + offset}
                  open={openBoards.some((b) => sameGameRef(b, ref))}
                  focused={sameGameRef(focusedGame, ref)}
                  active={game.id === activeId}
                  locale={locale}
                  onActivate={onActivate}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
