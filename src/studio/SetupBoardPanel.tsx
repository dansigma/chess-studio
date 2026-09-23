"use client";

import { useEffect, useMemo, useState } from "react";
import { Chessboard, type PieceRenderObject } from "react-chessboard";
import { Eraser, MousePointer2, X } from "lucide-react";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { getFenAt } from "@/src/chess/tree";
import {
  BLACK_SETUP_PIECES,
  WHITE_SETUP_PIECES,
  buildSetupFen,
  moveSetupPiece,
  parseSetupFen,
  placeSetupPiece,
  setupFenError,
  type SetupPiece,
  type SetupPosition,
} from "@/src/chess/setup-fen";
import { boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
import { publishVisibleFen } from "@/src/chess/copy-board";

type Tool = "cursor" | "trash" | SetupPiece;

function PieceButton({
  piece,
  active,
  pieces,
  onClick,
}: {
  piece: SetupPiece;
  active: boolean;
  pieces: PieceRenderObject;
  onClick: () => void;
}) {
  const Icon = pieces[piece];
  return (
    <button
      type="button"
      title={piece}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded ${
        active ? "bg-studio-hover-strong" : "hover:bg-studio-hover"
      }`}
    >
      {Icon ? <Icon svgStyle={{ width: 26, height: 26 }} /> : piece}
    </button>
  );
}

export function SetupBoardPanel() {
  const board = useActiveBoard();
  const settings = useStudioStore((state) => state.settings);
  const applySetupFen = useStudioStore((state) => state.applySetupFen);
  const setSetupMode = useStudioStore((state) => state.setSetupMode);
  const sourceFen = getFenAt(board.tree, board.path);
  const [position, setPosition] = useState<SetupPosition>(() => parseSetupFen(sourceFen));
  const [tool, setTool] = useState<Tool>("cursor");
  const [held, setHeld] = useState<string | null>(null);
  const [fenText, setFenText] = useState(() => buildSetupFen(parseSetupFen(sourceFen)));
  const fen = buildSetupFen(position);
  const error = setupFenError(fen);
  const theme = boardSquareStyles(settings.boardTheme);
  const pieces = piecesForSet(settings.pieceSet);

  useEffect(() => {
    setFenText(fen);
  }, [fen]);

  useEffect(() => {
    publishVisibleFen(fen);
    return () => publishVisibleFen(null);
  }, [fen]);

  const squareStyles = useMemo(() => {
    if (!held) {
      return {};
    }
    return { [held]: { boxShadow: "inset 0 0 0 3px rgba(255, 255, 255, 0.55)" } };
  }, [held]);

  function commit(next: SetupPosition) {
    setPosition(next);
  }

  function applyFenText() {
    const next = parseSetupFen(fenText);
    commit(next);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-studio-panel">
      <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1">
        <button
          type="button"
          className="rounded bg-studio-accent px-2.5 py-1 text-[12px] text-white disabled:opacity-40"
          disabled={Boolean(error)}
          onClick={() => applySetupFen(fen)}
        >
          Apply
        </button>
        <button
          type="button"
          title="Cursor"
          className={`rounded p-1.5 ${tool === "cursor" ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
          onClick={() => setTool("cursor")}
        >
          <MousePointer2 size={15} />
        </button>
        <button
          type="button"
          title="Remove piece"
          className={`rounded p-1.5 ${tool === "trash" ? "bg-studio-hover-strong text-studio-fg" : "text-studio-muted hover:bg-studio-hover"}`}
          onClick={() => setTool("trash")}
        >
          <Eraser size={15} />
        </button>
        <button
          type="button"
          title="Close setup"
          className="ml-auto rounded p-1.5 text-studio-fg hover:bg-studio-hover hover:text-studio-fg"
          onClick={() => setSetupMode(false)}
        >
          <X size={15} />
        </button>
      </div>
      <div className="flex items-center gap-1 border-b border-studio-border-subtle px-2 py-1">
        {WHITE_SETUP_PIECES.map((piece) => (
          <PieceButton
            key={piece}
            piece={piece}
            active={tool === piece}
            pieces={pieces}
            onClick={() => setTool(piece)}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-studio-hover" />
        {BLACK_SETUP_PIECES.map((piece) => (
          <PieceButton
            key={piece}
            piece={piece}
            active={tool === piece}
            pieces={pieces}
            onClick={() => setTool(piece)}
          />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 place-items-center p-2 [container-type:size]">
        <div
          data-board-image=""
          className="relative aspect-square overflow-hidden rounded-lg"
          style={{ height: "min(100cqh, 100cqw)" }}
        >
          <Chessboard
            options={{
              id: `setup-${board.id}-${settings.pieceSet}`,
              position: fen,
              boardOrientation: board.orientation,
              showNotation: settings.showCoordinates,
              animationDurationInMs: 0,
              showAnimations: false,
              allowDrawingArrows: false,
              lightSquareStyle: theme.light,
              darkSquareStyle: theme.dark,
              pieces,
              squareStyles,
              boardStyle: { width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" },
              canDragPiece: () => tool === "cursor",
              onPieceDrop: ({ sourceSquare, targetSquare }) => {
                if (!targetSquare) {
                  commit(placeSetupPiece(position, sourceSquare, null));
                  return true;
                }
                commit(moveSetupPiece(position, sourceSquare, targetSquare));
                setHeld(null);
                return true;
              },
              onSquareClick: ({ square, piece }) => {
                if (tool === "trash") {
                  commit(placeSetupPiece(position, square, null));
                  setHeld(null);
                  return;
                }
                if (tool !== "cursor") {
                  commit(placeSetupPiece(position, square, tool));
                  return;
                }
                if (held) {
                  commit(moveSetupPiece(position, held, square));
                  setHeld(null);
                  return;
                }
                if (piece) {
                  setHeld(square);
                }
              },
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-studio-border px-2 py-2">
        <button
          type="button"
          className="shrink-0 rounded border border-studio-border px-2 py-1 text-[11px] text-studio-fg hover:bg-studio-hover"
          onClick={() => commit({ ...position, turn: position.turn === "w" ? "b" : "w" })}
        >
          {position.turn === "w" ? "White to Play" : "Black to Play"}
        </button>
        <input
          value={fenText}
          onChange={(event) => setFenText(event.target.value)}
          onBlur={applyFenText}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              applyFenText();
            }
          }}
          placeholder="Paste a FEN"
          className="min-w-0 flex-1 rounded border border-studio-border bg-studio-selected px-2 py-1 text-[11px] text-studio-fg outline-none"
        />
      </div>
      {error ? (
        <div className="border-t border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200/80">
          {error.replace(/^Error:\s*/, "")}
        </div>
      ) : null}
    </div>
  );
}
