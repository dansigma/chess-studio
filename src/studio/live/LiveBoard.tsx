"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpDown, ArrowUpRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { Chessboard } from "react-chessboard";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { getFenAt, getNodeAt, goBack, goEnd, type Path } from "@/src/chess/tree";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { LiveGame } from "@/src/lib/live/types";
import { useStudioStore } from "@/src/store/studio-store";
import { Line, NotationReadOnlyContext } from "../NotationMoves";
import { pathKey } from "../notation-format";
import { Button, IconButton } from "../ui/Button";
import { outcomeFor } from "../ui/PlayerCell";
import { pgnResultToWinner } from "../ResultMark";
import { clockAtPath, evalAtView, resolveViewPath } from "./live-board-model";
import { formatDisplayClock, type Side } from "./live-clock";
import { LiveEvalBar } from "./LiveEvalBar";
import { ClockCell } from "./LiveGamesTable";
import { LivePlayerCell } from "./LivePlayerCell";
import { useLiveStore } from "./live-store";
import { liveStudioHref } from "./live-studio-link";
import { useLiveBoardNotation } from "./use-live-board-notation";
import { useLiveGame, useLiveRoundInfo } from "./use-live";

const NO_COLLAPSE = new Set<string>();
const noop = () => {};
const LAST_MOVE_STYLE = { backgroundColor: "rgba(255, 213, 79, 0.4)" };

function uciSquares(uci: string | null): [string, string] | null {
  return uci && uci.length >= 4 ? [uci.slice(0, 2), uci.slice(2, 4)] : null;
}

/** One side's name, rating and clock. `historic` replaces the running clock with the one at a browsed ply. */
function PlayerBar({
  game,
  side,
  locale,
  historic,
  dense = false,
}: {
  game: LiveGame;
  side: Side;
  locale: SiteLocale;
  /** Small cards (Compact, thumbnails): no federation chip, so the name keeps its room next to the clock. */
  dense?: boolean;
  /** Set while browsing: the clock at the viewed ply (null = none recorded). */
  historic?: { ms: number | null };
}) {
  const winner = pgnResultToWinner(game.result);
  const player = game[side];
  return (
    <div className="flex min-h-7 items-center justify-between gap-2" data-live-player={side}>
      <div className="min-w-0 flex-1 overflow-hidden">
        <LivePlayerCell player={dense ? { ...player, fed: null } : player} outcome={outcomeFor(winner, side)} layout="inline" />
      </div>
      <div className="shrink-0 text-dense tabular-nums" data-live-clock={side}>
        {historic ? (
          // Browsing: the clock recorded at that ply, never highlighted (nobody is "to move" in the past).
          <span className="inline-flex min-w-14 justify-center rounded-md border border-dashed border-studio-border px-2 py-0.5 text-studio-muted">
            {historic.ms === null ? tLive(locale, "live.board.noClock") : formatDisplayClock(historic.ms)}
          </span>
        ) : (
          <ClockCell game={game} side={side} locale={locale} variant="board" />
        )}
      </div>
    </div>
  );
}

/**
 * SIG-1313: how much of a card is drawn.
 *  - `full`: board, notation and move buttons (the Grid layout).
 *  - `focus`: like `full`, but the notation takes the height left (the large card of the Focus layout).
 *  - `compact`: no notation or move buttons; the board is sized by the card's height, so a grid of them fits its pane.
 *  - `thumb`: no notation or move buttons, a small card (the other boards of the Focus layout).
 */
export type LiveBoardVariant = "full" | "focus" | "compact" | "thumb";

/**
 * Follow-latest. By default the board shows the newest position of the game (`game.fen`) and each new
 * move moves it. Browsing back in the notation pauses that (`browsing` holds the viewed mainline path),
 * new moves still arrive in the notation, and a "back to live" button resumes. While browsing, the
 * player bars show the `%clk` at the viewed ply (from the PGN, "–" when the PGN has none); the ticking
 * current clocks only show at the latest ply, i.e. while following. Picking the last move resumes too.
 */
export function LiveBoard({
  roundId,
  gameId,
  focused,
  locale,
  onClose,
  onFocus,
  showEval = false,
  variant = "full",
  flipped = false,
  onFlip,
}: {
  roundId: string;
  gameId: string;
  focused: boolean;
  locale: SiteLocale;
  onClose: () => void;
  onFocus: () => void;
  /** Show the eval bar beside this board (the "Show eval bar" toggle; off hides every bar). */
  showEval?: boolean;
  variant?: LiveBoardVariant;
  /** SIG-1313: black at the bottom. Per card: the board, the player bars and the eval bar turn together. */
  flipped?: boolean;
  onFlip?: () => void;
}) {
  const game = useLiveGame(roundId, gameId);
  // A round that hasn't started: its games are not live yet (the JSON calls it neither ongoing nor finished).
  const roundInfo = useLiveRoundInfo(roundId);
  const roundNotStarted = roundInfo !== undefined && !roundInfo.round.ongoing && !roundInfo.round.finished;
  const streamed = useLiveStore((s) => s.streamRoundId === roundId);
  const tree = useLiveBoardNotation(roundId, gameId, game);
  const boardTheme = useStudioStore((s) => s.settings.boardTheme);
  const pieceSet = useStudioStore((s) => s.settings.pieceSet);
  const showCoordinates = useStudioStore((s) => s.settings.showCoordinates);
  const moveNotation = useStudioStore((s) => s.settings.moveNotation);

  const [browsing, setBrowsing] = useState<Path | null>(null);
  const notationRef = useRef<HTMLDivElement | null>(null);

  const latest = useMemo(() => (tree ? goEnd(tree, []) : []), [tree]);
  const viewPath = tree ? resolveViewPath(tree, browsing) : null;
  const following = viewPath === null;
  const currentKey = pathKey(viewPath ?? latest);

  useEffect(() => {
    // Scroll the notation box only. `scrollIntoView` also scrolls every ancestor (the boards pane, even
    // overflow-hidden ones), which made the grid jump to the last card on load and on every new move.
    const box = notationRef.current;
    const active = box?.querySelector('[aria-current="step"]');
    if (box && active) {
      const boxRect = box.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      if (rect.top < boxRect.top) {
        box.scrollTop += rect.top - boxRect.top;
      } else if (rect.bottom > boxRect.bottom) {
        box.scrollTop += rect.bottom - boxRect.bottom;
      }
    }
  }, [currentKey]);

  const theme = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);
  const node = tree && viewPath ? getNodeAt(tree, viewPath) : null;
  const highlight = node ? ([node.from, node.to] as const) : uciSquares(game?.lastMoveUci ?? null);
  const squareStyles = useMemo(
    () => (highlight ? { [highlight[0]]: LAST_MOVE_STYLE, [highlight[1]]: LAST_MOVE_STYLE } : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the squares, not the tuple identity
    [highlight?.[0], highlight?.[1]],
  );

  if (!game) {
    return (
      <div
        role="status"
        aria-busy="true"
        data-live-board={gameId}
        className="group grid aspect-square place-items-center rounded-lg border border-studio-border-subtle p-4 text-sm text-studio-muted"
      >
        <span>{tLive(locale, "live.board.waiting")}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label={tLive(locale, "live.board.close")}
          data-live-close=""
          className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  const fen = viewPath && tree ? getFenAt(tree, viewPath) : game.fen;
  const finished = game.result !== "*";

  // Picking the latest ply is the same as following it.
  const goTo = (path: Path) => setBrowsing(tree && path.length === latest.length ? null : path);
  const goFirst = () => goTo([]);
  const goPrev = () => goTo(goBack(viewPath ?? latest));
  const goNext = () => {
    if (viewPath) {
      goTo([...viewPath, 0]);
    }
  };
  const goLast = () => setBrowsing(null);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const handlers: Record<string, () => void> = { ArrowLeft: goPrev, ArrowRight: goNext, Home: goFirst, End: goLast };
    const handler = handlers[event.key];
    if (handler && tree && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      handler();
    }
  };

  const historic = (side: Side) => (viewPath && tree ? { ms: clockAtPath(tree, viewPath, side) } : undefined);

  // SIG-1315: open the game in a new browser tab, straight from the click (no request first, so it is
  // not blocked as a pop-up). Switching this tab would unmount Live and stop the broadcast.
  const openInStudio = () => {
    const href = liveStudioHref({ roundId, gameId, ...(viewPath ? { ply: viewPath.length } : {}) });
    window.open(href, "_blank", "noopener");
  };

  const atStart = (viewPath ?? latest).length === 0;
  const orientation = flipped ? "black" : "white";
  const topSide: Side = flipped ? "white" : "black";
  const bottomSide: Side = flipped ? "black" : "white";
  const compact = variant === "compact";
  const focusVariant = variant === "focus";
  const dense = compact || variant === "thumb";
  // Compact and Focus size the board by the card's free height (it must fit the pane), not by its width.
  const sized = compact || focusVariant;
  const showNotation = variant === "full" || variant === "focus";
  const boardView = (
    <>
      {showEval ? (
        // SIG-1312: every card shows a bar for its shown ply: the broadcast's [%eval], else local
        // Stockfish on the focused card only (one engine search at a time), else a neutral bar.
        <div data-live-eval-slot="" className="flex shrink-0">
          <LiveEvalBar fen={fen} pgnEval={evalAtView(tree, viewPath, game)} focused={focused} orientation={orientation} />
        </div>
      ) : null}
      {/* The board is display-only: its own pointer handling must not swallow the card's drag (SIG-1313), so events pass to the card. */}
      <div className={`pointer-events-none ${sized ? "aspect-square h-full" : "aspect-square min-w-0 flex-1"}`} role="img" aria-label={tLive(locale, "live.boards.label")}>
        <Chessboard
          options={{
            id: `live-board-${roundId}-${gameId}`,
            position: fen,
            boardOrientation: orientation,
            showNotation: showCoordinates,
            animationDurationInMs: 0,
            showAnimations: false,
            allowDragging: false,
            allowDrawingArrows: false,
            lightSquareStyle: theme.light,
            darkSquareStyle: theme.dark,
            ...boardCoordinateOptions(boardTheme),
            pieces,
            squareStyles,
            boardStyle: { width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" },
          }}
        />
      </div>
    </>
  );
  return (
    <article
      aria-label={tLive(locale, "live.board.label", { white: game.white.name, black: game.black.name })}
      data-live-board={gameId}
      data-focused={focused || undefined}
      data-following={following || undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={onFocus}
      data-live-variant={variant}
      className={`group flex h-full min-w-0 cursor-default flex-col rounded-xl border bg-studio-panel shadow-sm ${
        dense ? "gap-1.5 p-2" : "gap-2 p-3"
      } outline-none transition-colors focus-visible:ring-1 focus-visible:ring-studio-accent ${
        focused ? "border-studio-accent ring-1 ring-studio-accent" : "border-studio-border-subtle hover:border-studio-border"
      }`}
    >
      <header className="-mr-1 -mt-1 flex h-7 items-center gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-caption text-studio-muted">
          {finished ? null : roundNotStarted ? (
            <span data-live-not-started="">{tLive(locale, "live.board.notStarted")}</span>
          ) : streamed ? (
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-studio-danger" data-live-badge="">
              <span className="h-1.5 w-1.5 rounded-full bg-studio-danger motion-safe:animate-pulse" aria-hidden="true" />
              {tLive(locale, "live.board.liveBadge")}
            </span>
          ) : (
            <span data-live-polled-hint="">{tLive(locale, "live.board.polledHint")}</span>
          )}
        </span>
        <button
          type="button"
          className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-studio-border px-1.5 text-caption font-medium text-studio-fg-secondary hover:border-studio-accent hover:bg-studio-accent-soft hover:text-studio-accent-text disabled:cursor-default disabled:opacity-50 disabled:hover:border-studio-border disabled:hover:bg-transparent disabled:hover:text-studio-fg-secondary"
          aria-label={tLive(locale, "live.board.openInStudio")}
          title={tLive(locale, "live.board.openInStudio")}
          onClick={(event) => {
            event.stopPropagation();
            openInStudio();
          }}
          data-live-open-studio=""
        >
          {tLive(locale, "live.board.studioShort")}
          <ArrowUpRight size={13} aria-hidden="true" />
        </button>
        <IconButton
          size="sm"
          label={tLive(locale, "live.board.flip")}
          active={flipped}
          className="text-studio-muted hover:text-studio-fg"
          data-live-flip=""
          onClick={(event) => {
            event.stopPropagation();
            onFlip?.();
          }}
        >
          <ArrowUpDown size={14} aria-hidden="true" />
        </IconButton>
        <IconButton
          size="sm"
          label={tLive(locale, "live.board.close")}
          className="text-studio-muted hover:text-studio-fg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          data-live-close=""
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X size={14} aria-hidden="true" />
        </IconButton>
      </header>

      <PlayerBar game={game} side={topSide} locale={locale} historic={historic(topSide)} dense={dense} />
      {sized ? (
        // The cell is a size container: the board (and its eval bar) is the largest square that fits the card's
        // free height and width, so Compact cards never need a vertical scroll and the Focus card fits its pane.
        <div
          className={`flex min-w-0 items-center justify-center [container-type:size] ${focusVariant ? "min-h-48 flex-[3]" : "min-h-0 flex-1"}`}
          data-live-board-cell=""
        >
          <div
            className="flex items-stretch gap-1.5"
            style={{ height: showEval ? "min(100cqh, calc(100cqw - 1.625rem))" : "min(100cqh, 100cqw)" }}
          >
            {boardView}
          </div>
        </div>
      ) : (
        <div className="flex items-stretch gap-1.5">{boardView}</div>
      )}
      <PlayerBar game={game} side={bottomSide} locale={locale} historic={historic(bottomSide)} dense={dense} />

      {/* Always rendered at a fixed height (empty + aria-hidden while ongoing) so a card never grows when its game ends. */}
      <p
        className="h-5 text-center text-dense font-semibold tabular-nums text-studio-fg"
        data-live-result=""
        aria-hidden={finished ? undefined : true}
      >
        {finished
          ? tLive(locale, "live.board.gameOver", { result: game.result === "1/2-1/2" ? "½ – ½" : game.result.replace("-", " – ") })
          : null}
      </p>

      {showNotation ? (
        <>
        <div className="flex h-7 items-center justify-center gap-1" role="group" aria-label={tLive(locale, "live.board.notation")}>
          <Button variant="ghost" size="sm" onClick={goFirst} disabled={!tree || atStart} aria-label={tLive(locale, "live.board.first")}>
            <ChevronsLeft size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={goPrev} disabled={!tree || atStart} aria-label={tLive(locale, "live.board.prev")}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={goNext} disabled={following} aria-label={tLive(locale, "live.board.next")}>
            <ChevronRight size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={goLast} disabled={following} aria-label={tLive(locale, "live.board.last")}>
            <ChevronsRight size={14} />
          </Button>
          {!following ? (
            <Button variant="primary" size="sm" onClick={goLast} data-live-back-to-live="">
              {tLive(locale, finished ? "live.board.toEnd" : "live.board.backToLive")}
            </Button>
          ) : null}
        </div>

        <div
          ref={notationRef}
          aria-label={tLive(locale, "live.board.notation")}
          className={`overflow-auto text-body ${focusVariant ? "min-h-24 flex-1" : "h-40"}`}
          data-live-notation=""
        >
          {!tree || tree.children.length === 0 ? (
            <div className="text-studio-faint">{tLive(locale, "live.board.noMoves")}</div>
          ) : (
            <NotationReadOnlyContext.Provider value>
              <div className="flex flex-wrap items-center gap-0.5">
                <Line
                  nodes={tree.children}
                  parentPath={[]}
                  startFen={tree.startFen}
                  collapsed={NO_COLLAPSE}
                  currentPath={currentKey}
                  style={moveNotation}
                  goPath={goTo}
                  onToggleCollapse={noop}
                  onAnnotate={noop}
                  depth={0}
                  locale={locale}
                />
              </div>
            </NotationReadOnlyContext.Provider>
          )}
        </div>
        </>
      ) : null}
    </article>
  );
}
