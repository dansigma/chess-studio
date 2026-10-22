"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useActiveBoardId } from "@/src/store/hooks";
import { selectBoard, useStudioStore } from "@/src/store/studio-store";
import { getFenAt, getLastMove, getMarksAt } from "@/src/chess/tree";
import {
  MARK_FILL,
  MARK_HEX,
  arrowsForRender,
  colorFromModifiers,
  type MarkColor,
} from "@/src/chess/marks";
import { threatSquaresFromUci, useThreat } from "./useThreat";
import { BoardEvalBar } from "./BoardEvalBar";
import { BoardContextMenu, type BoardMenuState } from "./BoardContextMenu";
import { SetupBoardPanel } from "./SetupBoardPanel";
import { boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { boardImageElement, fenToCopy, publishVisibleFen } from "@/src/chess/copy-board";
import { boardPngBlob, copyPngToClipboard, downloadPng } from "@/src/chess/copy-board-image";
import type { SiteLocale } from "@/src/i18n/locale.ts";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { Button } from "./ui/Button";
import { useDialogFocus } from "./ui/use-dialog-focus";

const PROMOTION_PIECE_KEYS: Record<string, Parameters<typeof tPanels>[1]> = {
  q: "panels.board.promoteQueen",
  r: "panels.board.promoteRook",
  b: "panels.board.promoteBishop",
  n: "panels.board.promoteKnight",
};

const PROMOTION_PIECES = [
  { piece: "q" },
  { piece: "r" },
  { piece: "b" },
  { piece: "n" },
] as const;

type PendingDraw = {
  square: string;
  color: MarkColor;
};

export function BoardPanel({ boardId: boardIdProp }: { boardId?: string } = {}) {
  const locale: SiteLocale = useStudioStore((state) => state.settings.locale);
  const activeBoardId = useActiveBoardId();
  const board = useStudioStore((state) => selectBoard(state, boardIdProp));
  const isActive = board.id === activeBoardId;
  const enginePreview = useStudioStore((state) => state.enginePreview);
  const setEnginePreview = useStudioStore((state) => state.setEnginePreview);
  const engineEval = useStudioStore((state) => state.engineEval);
  const threat = useStudioStore((state) => state.threat);
  const showThreat = useStudioStore((state) => state.showThreat);
  const insightMarks = useStudioStore((state) => state.insightMarks);
  const setShowThreat = useStudioStore((state) => state.setShowThreat);
  // SIG-907: only the active session's panel drives the shared threat lease
  // so split-view panels never contend for the `threat` slot.
  useThreat(isActive);
  const baseFen = getFenAt(board.tree, board.path);
  const baseLastMove = getLastMove(board.tree, board.path);
  // Engine preview stays global (active-board-scoped): only the active
  // panel renders the preview FEN; split panels keep their stored position.
  const fen = isActive && enginePreview ? enginePreview.fen : baseFen;
  const lastMoveKey =
    isActive && enginePreview
      ? enginePreview.lastMove
      : baseLastMove
        ? `${baseLastMove.from}${baseLastMove.to}`
        : "";
  // SIG-857: primitive settings picks — the old `state.settings` object
  // re-rendered the board on every preference change (e.g. move sound).
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showEvalBar = useStudioStore((state) => state.settings.showEvalBar);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const makeUciMove = useStudioStore((state) => state.makeUciMove);
  const flip = useStudioStore((state) => state.flip);
  const setActiveBoard = useStudioStore((state) => state.setActiveBoard);
  // SIG-907: split panels are fully interactive. Mutations stay
  // active-board-scoped in the store, so ensure this session is active
  // before mutating — zustand applies set() synchronously, so the
  // following makeUciMove/flip/mark call lands on this board.
  function ensureActive() {
    if (!isActive) {
      setActiveBoard(board.id);
    }
  }
  const toggleEvalBar = useStudioStore((state) => state.toggleEvalBar);
  const toggleBoardSquareMark = useStudioStore((state) => state.toggleBoardSquareMark);
  const toggleBoardArrowMark = useStudioStore((state) => state.toggleBoardArrowMark);
  const setupMode = useStudioStore((state) => state.setupMode);
  const setStatus = useStudioStore((state) => state.setStatus);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    from: string;
    to: string;
    color: MarkColor;
  } | null>(null);
  const [boardMenu, setBoardMenu] = useState<BoardMenuState | null>(null);
  const pending = useRef<PendingDraw | null>(null);
  const promotionRef = useRef<HTMLDivElement>(null);
  useDialogFocus(promotionRef, promotion !== null);

  const storedMarks = isActive && enginePreview ? null : getMarksAt(board.tree, board.path);
  const squareMarks = useMemo(() => storedMarks?.squares ?? [], [storedMarks]);
  const arrowMarks = useMemo(() => storedMarks?.arrows ?? [], [storedMarks]);
  // SIG-959: transient Insights overlay (hover / threat arrows). FEN-guarded
  // against the position actually shown, never stored on the tree.
  const insight = isActive && insightMarks?.fen === fen ? insightMarks.marks : null;
  const previewing = Boolean(isActive && enginePreview);
  const [wasPreviewing, setWasPreviewing] = useState(previewing);
  if (wasPreviewing !== previewing) {
    setWasPreviewing(previewing);
    if (previewing) {
      setSelected(null);
      setPreview(null);
    }
  }

  useEffect(() => {
    // SIG-907: only the active panel publishes — with two boards mounted the
    // last-mounting panel must not overwrite the focused session's FEN.
    if (!isActive) {
      return;
    }
    publishVisibleFen(fen);
    return () => publishVisibleFen(null);
  }, [fen, isActive]);

  useEffect(() => {
    if (previewing) {
      pending.current = null;
    }
  }, [previewing]);

  useEffect(() => {
    function onUp(event: MouseEvent) {
      if (event.button !== 2) {
        return;
      }
      queueMicrotask(() => {
        pending.current = null;
        setPreview(null);
      });
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  useEffect(() => {
    if (!promotion) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setPromotion(null);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [promotion]);

  const dests = useMemo(() => {
    if (!selected) {
      return [] as string[];
    }
    try {
      const chess = new Chess(fen);
      return chess
        .moves({ square: selected as Square, verbose: true })
        .map((move) => move.to);
    } catch {
      return [] as string[];
    }
  }, [fen, selected]);

  const squareStyles = useMemo(() => {
    const lastMove =
      lastMoveKey.length === 4
        ? { from: lastMoveKey.slice(0, 2), to: lastMoveKey.slice(2, 4) }
        : null;
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: "rgba(186, 202, 68, 0.72)" };
      styles[lastMove.to] = { backgroundColor: "rgba(186, 202, 68, 0.72)" };
    }
    for (const mark of squareMarks) {
      styles[mark.square] = {
        ...(styles[mark.square] ?? {}),
        backgroundColor: MARK_FILL[mark.color],
      };
    }
    for (const mark of insight?.squares ?? []) {
      styles[mark.square] = {
        ...(styles[mark.square] ?? {}),
        backgroundColor: MARK_FILL[mark.color],
      };
    }
    if (selected) {
      styles[selected] = {
        ...(styles[selected] ?? {}),
        boxShadow: "inset 0 0 0 3px rgba(255, 255, 255, 0.55)",
      };
    }
    for (const square of dests) {
      styles[square] = {
        ...(styles[square] ?? {}),
        backgroundImage:
          "radial-gradient(circle, rgba(0,0,0,0.28) 22%, transparent 23%)",
      };
    }
    return styles;
  }, [dests, insight, lastMoveKey, squareMarks, selected]);

  const arrows = useMemo(() => {
    const base = arrowsForRender([...arrowMarks, ...(insight?.arrows ?? [])], preview);
    // SIG-906: ephemeral threat arrow appended LAST so it renders above
    // stored marks and the draw preview. Never stored in node marks, never
    // part of preview suppression. FEN-guarded: only show for the position
    // the one-shot was computed on. SIG-907: threat overlay applies to the
    // active session's panel only.
    if (!isActive || !showThreat || !threat || threat.fen !== fen) {
      return base;
    }
    const squares = threatSquaresFromUci(threat.uci);
    if (!squares) {
      return base;
    }
    if (base.some((item) => item.startSquare === squares.from && item.endSquare === squares.to)) {
      return base;
    }
    return [
      ...base,
      { startSquare: squares.from, endSquare: squares.to, color: MARK_HEX.R },
    ];
  }, [arrowMarks, insight, isActive, preview, showThreat, threat, fen]);

  function attemptMove(from: string, to: string): boolean {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      return false;
    }
    const legal = chess
      .moves({ square: from as Square, verbose: true })
      .filter((move) => move.to === to);
    if (legal.length === 0) {
      return false;
    }
    ensureActive();
    if (legal.some((move) => Boolean(move.promotion))) {
      setPromotion({ from, to });
      setSelected(null);
      return false;
    }
    const ok = makeUciMove(from, to);
    setSelected(null);
    return ok;
  }

  const theme = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);
  const turn = fen.split(" ")[1] === "b" ? "b" : "w";

  if (setupMode && isActive) {
    return <SetupBoardPanel />;
  }

  return (
    <div
      className="grid h-full min-h-0 w-full place-items-center overflow-hidden bg-studio-panel p-2 [container-type:size]"
      onContextMenu={(event) => {
        event.preventDefault();
        setBoardMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div
        className="flex items-stretch gap-1.5"
        style={{
          height: showEvalBar
            ? "min(100cqh, calc(100cqw - 1.5rem))"
            : "min(100cqh, 100cqw)",
        }}
      >
        {showEvalBar ? (
          <BoardEvalBar
            pawns={engineEval?.pawns ?? 0}
            label={engineEval?.label ?? "0.00"}
            orientation={board.orientation}
          />
        ) : null}
        <div
          data-board-image=""
          className="relative aspect-square h-full overflow-hidden rounded-lg shadow-[0_6px_20px_rgb(0_0_0/0.28)] ring-1 ring-studio-border-strong"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
        <Chessboard
          key={`${board.id}-${pieceSet}`}
          options={{
            id: `board-${board.id}`,
            position: fen,
            boardOrientation: board.orientation,
            showNotation: showCoordinates,
            animationDurationInMs: 0,
            showAnimations: false,
            allowDrawingArrows: false,
            clearArrowsOnClick: false,
            clearArrowsOnPositionChange: false,
            arrows,
            lightSquareStyle: theme.light,
            darkSquareStyle: theme.dark,
            pieces,
            squareStyles,
            boardStyle: { width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" },
            canDragPiece: ({ piece }) => {
              if (previewing) {
                return false;
              }
              const color = piece.pieceType.startsWith("w") ? "w" : "b";
              return color === turn;
            },
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (previewing || !targetSquare) {
                return false;
              }
              return attemptMove(sourceSquare, targetSquare);
            },
            onSquareClick: ({ square, piece }) => {
              if (previewing) {
                // Never leave the user in a dead board: a lingering engine
                // preview (hover that did not clear) must not swallow clicks.
                setEnginePreview(null);
                return;
              }
              if (selected && dests.includes(square)) {
                attemptMove(selected, square);
                return;
              }
              if (piece) {
                const color = piece.pieceType.startsWith("w") ? "w" : "b";
                if (color === turn) {
                  setSelected(square);
                  return;
                }
              }
              setSelected(null);
            },
            onSquareMouseDown: ({ square }, event) => {
              if (previewing) {
                // First press on the board clears a stale engine preview so
                // the next click/drag is not silently blocked.
                setEnginePreview(null);
                return;
              }
              if (event.button !== 2) {
                return;
              }
              pending.current = {
                square,
                color: colorFromModifiers(event),
              };
            },
            onSquareMouseUp: ({ square }, event) => {
              if (event.button !== 2) {
                return;
              }
              const start = pending.current;
              pending.current = null;
              setPreview(null);
              if (!start) {
                return;
              }
              if (start.square === square) {
                ensureActive();
                toggleBoardSquareMark(square, start.color);
                return;
              }
              ensureActive();
              toggleBoardArrowMark(start.square, square, start.color);
            },
            onMouseOverSquare: ({ square }) => {
              const start = pending.current;
              if (!start || start.square === square) {
                setPreview(null);
                return;
              }
              setPreview({ from: start.square, to: square, color: start.color });
            },
          }}
        />
        {promotion ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-studio-scrim"
            role="dialog"
            aria-modal="true"
            aria-label={tPanels(locale, "panels.board.promoteDialog")}
            data-promotion-open
          >
            <div
              ref={promotionRef}
              className="flex flex-col gap-2 rounded-[10px] border border-studio-border-strong bg-studio-elevated p-3 shadow-2xl"
            >
              <span className="text-caption uppercase tracking-wider text-studio-faint">{tPanels(locale, "panels.board.promoteTo")}</span>
              <div className="flex gap-1.5">
                {PROMOTION_PIECES.map(({ piece }) => (
                  <Button
                    key={piece}
                    onClick={() => {
                      ensureActive();
                      makeUciMove(promotion.from, promotion.to, piece);
                      setPromotion(null);
                    }}
                  >
                    {tPanels(locale, PROMOTION_PIECE_KEYS[piece])}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPromotion(null)}>
                {tPanels(locale, "panels.board.cancel")}
              </Button>
            </div>
          </div>
        ) : null}
        </div>
      </div>
      {boardMenu ? (
        <BoardContextMenu
          menu={boardMenu}
          showEvalBar={showEvalBar}
          showThreat={showThreat}
          locale={locale}
          onFlip={() => {
            ensureActive();
            flip();
          }}
          onToggleEvalBar={toggleEvalBar}
          onToggleThreat={() => setShowThreat(!showThreat)}
          onCopyFen={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(fenToCopy(fen));
                setStatus(tPanels(locale, "panels.board.fenCopied"));
              } catch {
                setStatus(tPanels(locale, "panels.board.fenCopyFailed"));
              }
            })();
          }}
          onCopyImage={() => {
            void (async () => {
              const element = boardImageElement();
              if (!element) {
                setStatus(tPanels(locale, "panels.board.notOpen"));
                return;
              }
              try {
                const blob = await boardPngBlob(element);
                try {
                  await copyPngToClipboard(blob);
                  setStatus(tPanels(locale, "panels.board.imageCopied"));
                } catch {
                  downloadPng(blob, "board.png");
                  setStatus(tPanels(locale, "panels.board.imageDownloaded"));
                }
              } catch {
                setStatus(tPanels(locale, "panels.board.imageCopyFailed"));
              }
            })();
          }}
          onClose={() => setBoardMenu(null)}
        />
      ) : null}
    </div>
  );
}
