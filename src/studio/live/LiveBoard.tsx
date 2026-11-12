"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { Chessboard } from "react-chessboard";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { exportPgn } from "@/src/chess/pgn";
import { getFenAt, getNodeAt, goBack, goEnd, type Path } from "@/src/chess/tree";
import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { LiveGame } from "@/src/lib/live/types";
import { useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../dock-api";
import { Line, NotationReadOnlyContext } from "../NotationMoves";
import { pathKey } from "../notation-format";
import { Button, IconButton } from "../ui/Button";
import { outcomeFor } from "../ui/PlayerCell";
import { pgnResultToWinner } from "../ResultMark";
import { clockAtPath, resolveViewPath } from "./live-board-model";
import { formatDisplayClock, type Side } from "./live-clock";
import { LiveEvalBar } from "./LiveEvalBar";
import { ClockCell } from "./LiveGamesTable";
import { LivePlayerCell } from "./LivePlayerCell";
import { useLiveStore } from "./live-store";
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
}: {
  game: LiveGame;
  side: Side;
  locale: SiteLocale;
  /** Set while browsing: the clock at the viewed ply (null = none recorded). */
  historic?: { ms: number | null };
}) {
  const winner = pgnResultToWinner(game.result);
  const player = game[side];
  return (
    <div className="flex min-h-7 items-center justify-between gap-2" data-live-player={side}>
      <div className="min-w-0 flex-1">
        <LivePlayerCell player={player} outcome={outcomeFor(winner, side)} layout="inline" />
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
}: {
  roundId: string;
  gameId: string;
  focused: boolean;
  locale: SiteLocale;
  onClose: () => void;
  onFocus: () => void;
  /** Show the eval bar beside this board (only ever rendered while focused). */
  showEval?: boolean;
}) {
  const game = useLiveGame(roundId, gameId);
  const info = useLiveRoundInfo(roundId);
  const streamed = useLiveStore((s) => s.streamRoundId === roundId);
  const tree = useLiveBoardNotation(roundId, gameId, game);
  const boardTheme = useStudioStore((s) => s.settings.boardTheme);
  const pieceSet = useStudioStore((s) => s.settings.pieceSet);
  const showCoordinates = useStudioStore((s) => s.settings.showCoordinates);
  const moveNotation = useStudioStore((s) => s.settings.moveNotation);
  const openListedGame = useStudioStore((s) => s.openListedGame);
  const setWorkspaceView = useStudioStore((s) => s.setWorkspaceView);

  const [browsing, setBrowsing] = useState<Path | null>(null);
  const notationRef = useRef<HTMLDivElement | null>(null);

  const latest = useMemo(() => (tree ? goEnd(tree, []) : []), [tree]);
  const viewPath = tree ? resolveViewPath(tree, browsing) : null;
  const following = viewPath === null;
  const currentKey = pathKey(viewPath ?? latest);

  useEffect(() => {
    const active = notationRef.current?.querySelector('[aria-current="step"]');
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
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

  const openInStudio = () => {
    if (!tree) {
      return;
    }
    const headers: Record<string, string> = {
      Event: info?.tour.name ?? "Lichess Broadcast",
      Site: info?.round.url ?? "https://lichess.org/broadcast",
      White: game.white.name,
      Black: game.black.name,
      Result: game.result,
    };
    for (const [prefix, player] of [["White", game.white], ["Black", game.black]] as const) {
      if (player.rating !== null) {
        headers[`${prefix}Elo`] = String(player.rating);
      }
      if (player.title) {
        headers[`${prefix}Title`] = player.title;
      }
    }
    // Live boards never touch the Studio boards; only this explicit action does (same flow as LibraryPreview).
    openListedGame({
      title: `${game.white.name} vs ${game.black.name}`,
      pgn: exportPgn(tree, headers),
      atFen: fen,
      openInNewBoard: true,
    });
    const active = useStudioStore.getState().active();
    setWorkspaceView("studio");
    openBoardPanel(active.id, active.title);
  };

  const atStart = (viewPath ?? latest).length === 0;
  return (
    <article
      aria-label={tLive(locale, "live.board.label", { white: game.white.name, black: game.black.name })}
      data-live-board={gameId}
      data-focused={focused || undefined}
      data-following={following || undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={onFocus}
      className={`group flex h-full min-w-0 cursor-default flex-col gap-2 rounded-xl border bg-studio-panel p-3 shadow-sm outline-none transition-colors focus-visible:ring-1 focus-visible:ring-studio-accent ${
        focused ? "border-studio-accent ring-1 ring-studio-accent" : "border-studio-border-subtle hover:border-studio-border"
      }`}
    >
      <header className="-mr-1 -mt-1 flex h-7 items-center gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-caption text-studio-muted">
          {finished ? null : streamed ? (
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
          disabled={!tree}
          data-live-open-studio=""
        >
          {tLive(locale, "live.board.studioShort")}
          <ArrowUpRight size={13} aria-hidden="true" />
        </button>
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

      <PlayerBar game={game} side="black" locale={locale} historic={historic("black")} />
      <div className="flex items-stretch gap-1.5">
        {showEval ? (
          // Every card reserves the eval column, so all boards in the grid keep the same size;
          // only the focused one fills it (one engine search at a time).
          focused ? (
            <div data-live-eval-slot="" className="flex shrink-0">
              <LiveEvalBar fen={fen} />
            </div>
          ) : (
            <div className="w-5 shrink-0" aria-hidden="true" />
          )
        ) : null}
        <div className="aspect-square min-w-0 flex-1" role="img" aria-label={tLive(locale, "live.boards.label")}>
          <Chessboard
            options={{
              id: `live-board-${roundId}-${gameId}`,
              position: fen,
              boardOrientation: "white",
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
      </div>
      <PlayerBar game={game} side="white" locale={locale} historic={historic("white")} />

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
        className="h-40 overflow-auto text-body"
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
    </article>
  );
}
