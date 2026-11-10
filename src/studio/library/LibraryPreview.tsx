"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Chessboard } from "react-chessboard";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { importPgn, type ImportedGame } from "@/src/chess/pgn";
import { getFenAt, getNodeAt, goBack, goEnd, goForward, type Path } from "@/src/chess/tree";
import { tLibrary } from "@/src/i18n/library-strings";
import { getLibrarySource } from "@/src/lib/library/sources";
import type { LibraryGameItem } from "@/src/lib/library/types";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "../dock-api";
import { Line, NotationReadOnlyContext } from "../NotationMoves";
import { pathKey } from "../notation-format";
import { Button } from "../ui/Button";
import { PlayerCell, outcomeFor } from "../ui/PlayerCell";
import {
  mainLineMoveCount,
  previewHeaderExtras,
  startPathForPosition,
} from "./library-preview-model";
import { useLibraryStore } from "./library-store";

type Loaded = { requestId: string; pgn: string; game: ImportedGame };
type Failed = { requestId: string; message: string };
type Outcome = Loaded | Failed;

const NO_COLLAPSE = new Set<string>();
const noop = () => {};

function isFailed(outcome: Outcome): outcome is Failed {
  return "message" in outcome;
}

/** Loads the PGN of `item` through its source adapter; a new request cancels the previous one. */
function useLibraryGamePgn(item: LibraryGameItem | null) {
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const requestId = item ? `${item.key}#${attempt}` : null;
  // Keyed on ids, not on the item object: a list reload hands back a new object
  // for the same game, which must not fetch its PGN again.
  const sourceId = item?.sourceId ?? null;
  const gameId = item?.gameId ?? null;

  useEffect(() => {
    if (!sourceId || !gameId || !requestId) {
      return;
    }
    const controller = new AbortController();
    const adapter = getLibrarySource(sourceId);
    const run = async () => {
      try {
        if (!adapter) {
          throw new Error(sourceId);
        }
        const pgn = await adapter.loadPgn(gameId, controller.signal);
        if (!controller.signal.aborted) {
          setOutcome({ requestId, pgn, game: importPgn(pgn) });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setOutcome({ requestId, message: error instanceof Error ? error.message : String(error) });
        }
      }
    };
    void run();
    return () => controller.abort();
  }, [sourceId, gameId, requestId]);

  const current = outcome && outcome.requestId === requestId ? outcome : null;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    requestId,
    loading: item !== null && current === null,
    error: current && isFailed(current) ? current.message : null,
    loaded: current && !isFailed(current) ? current : null,
    retry,
  };
}

export function LibraryPreview({ item }: { item: LibraryGameItem | null }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const { requestId, loading, error, loaded, retry } = useLibraryGamePgn(item);

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-studio-muted">
        {tLibrary(locale, "library.preview.select")}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm text-studio-fg">
        <p>{tLibrary(locale, "library.preview.error", { message: error })}</p>
        <Button variant="primary" size="sm" onClick={retry}>
          {tLibrary(locale, "library.error.retry")}
        </Button>
      </div>
    );
  }
  if (loading || !loaded || !requestId) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={tLibrary(locale, "library.preview.loading")}
        className="flex h-full flex-col gap-2 p-3"
      >
        <div className="h-5 w-2/3 animate-pulse rounded bg-studio-border/40" />
        <div className="aspect-square w-full max-w-xs animate-pulse rounded bg-studio-border/40" />
      </div>
    );
  }
  return <LoadedPreview key={requestId} item={item} loaded={loaded} />;
}

function LoadedPreview({ item, loaded }: { item: LibraryGameItem; loaded: Loaded }) {
  const { game, pgn } = loaded;
  const { tree, headers } = game;
  const locale = useStudioStore((state) => state.settings.locale);
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const orientation = useStudioStore((state) => selectActiveBoard(state).orientation);
  const openListedGame = useStudioStore((state) => state.openListedGame);
  const setWorkspaceView = useStudioStore((state) => state.setWorkspaceView);
  const positionFen = useLibraryStore((state) => state.filters.position?.fen ?? null);

  // The cursor starts on the filtered position (computed once per loaded game).
  const [path, setPath] = useState<Path>(() => startPathForPosition(tree, positionFen));
  const notationRef = useRef<HTMLDivElement | null>(null);

  const fen = getFenAt(tree, path);
  const node = getNodeAt(tree, path);
  const currentKey = pathKey(path);

  useEffect(() => {
    const active = notationRef.current?.querySelector('[aria-current="step"]');
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [currentKey]);

  const goFirst = () => setPath([]);
  const goPrev = () => setPath((current) => goBack(current));
  const goNext = () => setPath((current) => goForward(tree, current));
  const goLast = () => setPath((current) => goEnd(tree, current));

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const handlers: Record<string, () => void> = {
      ArrowLeft: goPrev,
      ArrowRight: goNext,
      Home: goFirst,
      End: goLast,
    };
    const handler = handlers[event.key];
    if (handler && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      handler();
    }
  };

  const theme = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);
  const squareStyles = useMemo(() => {
    if (!node) {
      return {};
    }
    const highlight = { backgroundColor: "rgba(255, 213, 79, 0.4)" };
    return { [node.from]: highlight, [node.to]: highlight };
  }, [node]);

  const extras = previewHeaderExtras(headers);
  const event = item.event ?? extras.event;
  const date = item.date ?? extras.date;
  const moveCount = mainLineMoveCount(tree);
  const winner = item.result === "1-0" ? "white" : item.result === "0-1" ? "black" : item.result === "*" ? null : "draw";
  const opening = [item.eco, item.opening].filter(Boolean).join(" · ") || headers.Opening || headers.ECO || null;

  const openInStudio = () => {
    openListedGame({
      title: `${item.white} vs ${item.black}`,
      pgn,
      atFen: fen,
      openInNewBoard: true,
    });
    const active = selectActiveBoard(useStudioStore.getState());
    setWorkspaceView("studio");
    openBoardPanel(active.id, active.title);
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3 outline-none focus-visible:ring-1 focus-visible:ring-studio-accent"
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="library-preview"
    >
      <header className="flex flex-col gap-1" data-testid="library-preview-header">
        <div className="text-caption text-studio-muted">
          {opening ?? tLibrary(locale, "library.preview.unknownOpening")}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 text-body">
          <PlayerCell name={item.white} rating={item.whiteElo} outcome={outcomeFor(winner, "white")} />
          <PlayerCell name={item.black} rating={item.blackElo} outcome={outcomeFor(winner, "black")} />
        </div>
        <div className="flex flex-wrap gap-x-3 text-caption tabular-nums text-studio-faint">
          <span data-testid="library-preview-result">{item.result}</span>
          {date ? <span>{date}</span> : null}
          {event ? <span className="truncate">{event}</span> : null}
          {moveCount > 0 ? <span>{tLibrary(locale, "library.preview.moves", { count: moveCount })}</span> : null}
        </div>
      </header>

      <div className="mx-auto aspect-square w-full max-w-sm" role="img" aria-label={tLibrary(locale, "library.preview.board")}>
        <Chessboard
          options={{
            id: `library-preview-${item.key}`,
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

      <div className="flex items-center justify-center gap-1" role="group" aria-label={tLibrary(locale, "library.preview.board")}>
        <Button variant="ghost" size="sm" onClick={goFirst} disabled={path.length === 0} aria-label={tLibrary(locale, "library.preview.first")}>
          <ChevronsLeft size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={goPrev} disabled={path.length === 0} aria-label={tLibrary(locale, "library.preview.prev")}>
          <ChevronLeft size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={goNext} disabled={goForward(tree, path) === path} aria-label={tLibrary(locale, "library.preview.next")}>
          <ChevronRight size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={goLast} disabled={goEnd(tree, path).length === path.length} aria-label={tLibrary(locale, "library.preview.last")}>
          <ChevronsRight size={14} />
        </Button>
      </div>

      <div
        ref={notationRef}
        aria-label={tLibrary(locale, "library.preview.notation")}
        className="min-h-24 flex-1 overflow-auto text-body"
        data-testid="library-preview-notation"
      >
        {tree.children.length === 0 ? (
          <div className="text-studio-faint">{tLibrary(locale, "library.preview.empty")}</div>
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
                goPath={setPath}
                onToggleCollapse={noop}
                onAnnotate={noop}
                depth={0}
                locale={locale}
              />
            </div>
          </NotationReadOnlyContext.Provider>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={openInStudio}>
          {tLibrary(locale, "library.preview.open")}
        </Button>
      </div>
    </div>
  );
}
