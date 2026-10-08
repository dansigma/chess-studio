"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useActiveBoard, useBoardFen, useBoardLastMoveSquares } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { getMarksAt } from "@/src/chess/tree";
import {
  MARK_FILL,
  arrowsForRender,
  colorFromModifiers,
  type MarkColor,
} from "@/src/chess/marks";
import { BoardEvalBar } from "./BoardEvalBar";
import { BoardContextMenu, type BoardMenuState } from "./BoardContextMenu";
import { SetupBoardPanel } from "./SetupBoardPanel";
import { boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { boardImageElement, fenToCopy, publishVisibleFen } from "@/src/chess/copy-board";
import { boardPngBlob, copyPngToClipboard, downloadPng } from "@/src/chess/copy-board-image";
import { Button } from "./ui/Button";
import { useDialogFocus } from "./ui/use-dialog-focus";

const PROMOTION_PIECES = [
  { piece: "q", label: "Queen" },
  { piece: "r", label: "Rook" },
  { piece: "b", label: "Bishop" },
  { piece: "n", label: "Knight" },
] as const;

type PendingDraw = {
  square: string;
  color: MarkColor;
};

export function BoardPanel() {
  const board = useActiveBoard();
  const fen = useBoardFen();
  const lastMoveKey = useBoardLastMoveSquares();
  const enginePreview = useStudioStore((state) => state.enginePreview);
  const engineEval = useStudioStore((state) => state.engineEval);
  const settings = useStudioStore((state) => state.settings);
  const makeUciMove = useStudioStore((state) => state.makeUciMove);
  const flip = useStudioStore((state) => state.flip);
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

  const storedMarks = enginePreview ? null : getMarksAt(board.tree, board.path);
  const squareMarks = useMemo(() => storedMarks?.squares ?? [], [storedMarks]);
  const arrowMarks = useMemo(() => storedMarks?.arrows ?? [], [storedMarks]);
  const previewing = Boolean(enginePreview);
  const [wasPreviewing, setWasPreviewing] = useState(previewing);
  if (wasPreviewing !== previewing) {
    setWasPreviewing(previewing);
    if (previewing) {
      setSelected(null);
      setPreview(null);
    }
  }

  useEffect(() => {
    publishVisibleFen(fen);
    return () => publishVisibleFen(null);
  }, [fen]);

  useEffect(() => {
    if (enginePreview) {
      pending.current = null;
    }
  }, [enginePreview]);

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
  }, [dests, lastMoveKey, squareMarks, selected]);

  const arrows = useMemo(
    () => arrowsForRender(arrowMarks, preview),
    [arrowMarks, preview],
  );

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
    if (legal.some((move) => Boolean(move.promotion))) {
      setPromotion({ from, to });
      setSelected(null);
      return false;
    }
    const ok = makeUciMove(from, to);
    setSelected(null);
    return ok;
  }

  const theme = boardSquareStyles(settings.boardTheme);
  const pieces = piecesForSet(settings.pieceSet);
  const turn = fen.split(" ")[1] === "b" ? "b" : "w";
  const showEvalBar = settings.showEvalBar;

  if (setupMode) {
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
          key={`${board.id}-${settings.pieceSet}`}
          options={{
            id: `board-${board.id}`,
            position: fen,
            boardOrientation: board.orientation,
            showNotation: settings.showCoordinates,
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
              if (enginePreview) {
                return false;
              }
              const color = piece.pieceType.startsWith("w") ? "w" : "b";
              return color === turn;
            },
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (enginePreview || !targetSquare) {
                return false;
              }
              return attemptMove(sourceSquare, targetSquare);
            },
            onSquareClick: ({ square, piece }) => {
              if (enginePreview) {
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
              if (enginePreview || event.button !== 2) {
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
                toggleBoardSquareMark(square, start.color);
                return;
              }
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
            aria-label="Choose promotion piece"
            data-promotion-open
          >
            <div
              ref={promotionRef}
              className="flex flex-col gap-2 rounded-[10px] border border-studio-border-strong bg-studio-elevated p-3 shadow-2xl"
            >
              <span className="text-caption uppercase tracking-wider text-studio-faint">Promote to</span>
              <div className="flex gap-1.5">
                {PROMOTION_PIECES.map(({ piece, label }) => (
                  <Button
                    key={piece}
                    onClick={() => {
                      makeUciMove(promotion.from, promotion.to, piece);
                      setPromotion(null);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPromotion(null)}>
                Cancel
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
          onFlip={flip}
          onToggleEvalBar={toggleEvalBar}
          onCopyFen={() => {
            void (async () => {
              try {
                await navigator.clipboard.writeText(fenToCopy(fen));
                setStatus("FEN copied to clipboard");
              } catch {
                setStatus("Could not copy FEN");
              }
            })();
          }}
          onCopyImage={() => {
            void (async () => {
              const element = boardImageElement();
              if (!element) {
                setStatus("Board is not open");
                return;
              }
              try {
                const blob = await boardPngBlob(element);
                try {
                  await copyPngToClipboard(blob);
                  setStatus("Board image copied");
                } catch {
                  downloadPng(blob, "board.png");
                  setStatus("Board image downloaded");
                }
              } catch {
                setStatus("Could not copy the board image");
              }
            })();
          }}
          onClose={() => setBoardMenu(null)}
        />
      ) : null}
    </div>
  );
}
