"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { LiveGame } from "@/src/lib/live/types";
import { pgnResultToWinner, ResultMark } from "../ResultMark";
import { PlayerCell, outcomeFor } from "../ui/PlayerCell";
import { moveSelection } from "../library/library-columns";
import { useVirtualRows } from "../library/use-virtual-rows";
import { displayClockMs, formatDisplayClock, tickingSide, type Side } from "./live-clock";
import { sameGameRef, useLiveStore } from "./live-store";
import { useLiveNow } from "./live-ticker";
import { useLiveRound } from "./use-live";

export const LIVE_ROW_HEIGHT = 40;
const FLASH_MS = 1200;
const GRID =
  "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_5.5rem_3rem_5.5rem_minmax(0,1fr)]";

/** Pure: whether a click opens the game as another board (Ctrl/Cmd) instead of following it. */
export function isAddBoardClick(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey;
}

function TickingClock({ game, side }: { game: LiveGame; side: Side }) {
  const tick = useLiveNow();
  const ms = displayClockMs(game, side, tick);
  return <span data-clock-ticking="">{ms === null ? null : formatDisplayClock(ms)}</span>;
}

/** Static unless `side` is the one to move in an ongoing game: only then it subscribes to the shared ticker. */
export function ClockCell({ game, side, locale }: { game: LiveGame; side: Side; locale: SiteLocale }) {
  const base = game[side].clockMs;
  if (base === null) {
    return <span className="text-caption text-studio-faint">{tLive(locale, "live.table.noClock")}</span>;
  }
  if (tickingSide(game) === side) {
    return <TickingClock game={game} side={side} />;
  }
  return <span>{formatDisplayClock(base)}</span>;
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
      className={`grid cursor-default items-center gap-x-2 border-l-2 px-3 transition-colors duration-700 hover:bg-studio-hover-subtle ${GRID} ${background} ${
        open ? "border-studio-accent" : "border-transparent"
      } ${active ? "outline outline-1 -outline-offset-1 outline-studio-accent" : ""}`}
      style={{ height: LIVE_ROW_HEIGHT }}
      title={open ? tLive(locale, "live.table.open") : tLive(locale, "live.table.hint")}
      onClick={(event: MouseEvent) => onActivate(game, isAddBoardClick(event))}
    >
      <div role="cell" className="min-w-0">
        <PlayerCell
          name={game.white.name}
          rating={game.white.rating}
          title={game.white.title}
          fed={game.white.fed}
          outcome={outcomeFor(winner, "white")}
          emphasis={focused}
        />
        <div className="text-caption tabular-nums text-studio-muted sm:hidden">
          <ClockCell game={game} side="white" locale={locale} />
        </div>
      </div>
      <div role="cell" className="hidden text-right text-dense tabular-nums text-studio-fg sm:block">
        <ClockCell game={game} side="white" locale={locale} />
      </div>
      <div role="cell" className="flex justify-center">
        <ResultMark winner={winner} />
      </div>
      <div role="cell" className="hidden text-right text-dense tabular-nums text-studio-fg sm:block">
        <ClockCell game={game} side="black" locale={locale} />
      </div>
      <div role="cell" className="min-w-0">
        <PlayerCell
          name={game.black.name}
          rating={game.black.rating}
          title={game.black.title}
          fed={game.black.fed}
          outcome={outcomeFor(winner, "black")}
          emphasis={focused}
        />
        <div className="text-caption tabular-nums text-studio-muted sm:hidden">
          <ClockCell game={game} side="black" locale={locale} />
        </div>
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
        className={`grid shrink-0 items-center gap-x-2 border-b border-studio-border-subtle px-3 py-1 text-caption text-studio-muted ${GRID}`}
      >
        <div role="columnheader">{tLive(locale, "live.table.white")}</div>
        <div role="columnheader" className="hidden text-right sm:block">
          {tLive(locale, "live.table.whiteClock")}
        </div>
        <div role="columnheader" className="text-center">
          {tLive(locale, "live.table.result")}
        </div>
        <div role="columnheader" className="hidden text-right sm:block">
          {tLive(locale, "live.table.blackClock")}
        </div>
        <div role="columnheader">{tLive(locale, "live.table.black")}</div>
      </div>
      <div
        ref={attachScroll}
        onScroll={windowing.onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="rowgroup"
        aria-activedescendant={activeIndex >= 0 ? liveRowDomId(rows[activeIndex]!.id) : undefined}
        className="min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-studio-accent"
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
