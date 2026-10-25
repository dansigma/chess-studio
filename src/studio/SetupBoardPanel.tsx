"use client";

import { useEffect, useMemo, useState } from "react";
import { Chessboard, type PieceRenderObject } from "react-chessboard";
import { Eraser, MousePointer2, X } from "lucide-react";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
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
import { Button, IconButton } from "./ui/Button";

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
      aria-pressed={active}
      className={`flex h-8 w-8 items-center justify-center rounded-md ${
        active ? "bg-studio-accent-soft ring-1 ring-studio-accent" : "hover:bg-studio-hover-strong"
      }`}
    >
      {Icon ? <Icon svgStyle={{ width: 26, height: 26 }} /> : piece}
    </button>
  );
}

export function SetupBoardPanel() {
  const board = useActiveBoard();
  const settings = useStudioStore((state) => state.settings);
  const locale = settings.locale;
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

  const [syncedFen, setSyncedFen] = useState(fen);
  if (syncedFen !== fen) {
    setSyncedFen(fen);
    setFenText(fen);
  }

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
      <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1.5">
        <Button size="sm" variant="primary" disabled={Boolean(error)} onClick={() => applySetupFen(fen)}>
          {tPanels(locale, "panels.setup.apply")}
        </Button>
        <IconButton
          label={tPanels(locale, "panels.setup.cursor")}
          active={tool === "cursor"}
          className={tool === "cursor" ? "" : "text-studio-muted"}
          onClick={() => setTool("cursor")}
        >
          <MousePointer2 size={15} />
        </IconButton>
        <IconButton
          label={tPanels(locale, "panels.setup.removePiece")}
          active={tool === "trash"}
          className={tool === "trash" ? "" : "text-studio-muted"}
          onClick={() => setTool("trash")}
        >
          <Eraser size={15} />
        </IconButton>
        <IconButton label={tPanels(locale, "panels.setup.close")} className="ml-auto" onClick={() => setSetupMode(false)}>
          <X size={15} />
        </IconButton>
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
        <span className="mx-1 h-5 w-px bg-studio-border-strong" />
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
          className="relative aspect-square overflow-hidden rounded-lg shadow-[0_6px_20px_rgb(0_0_0/0.28)] ring-1 ring-studio-border-strong"
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
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => commit({ ...position, turn: position.turn === "w" ? "b" : "w" })}
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ring-1 ring-studio-border-strong ${
              position.turn === "w" ? "bg-studio-win" : "bg-studio-loss"
            }`}
          />
          {position.turn === "w" ? tPanels(locale, "panels.setup.whiteToPlay") : tPanels(locale, "panels.setup.blackToPlay")}
        </Button>
        <input
          value={fenText}
          onChange={(event) => setFenText(event.target.value)}
          onBlur={applyFenText}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              applyFenText();
            }
          }}
          placeholder={tPanels(locale, "panels.setup.pasteFen")}
          className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-studio-selected px-2 font-mono text-caption text-studio-fg outline-none focus:border-studio-accent"
        />
      </div>
      {error ? (
        <div className="border-t border-studio-border-subtle bg-studio-warning-bg px-2 py-1.5 text-caption text-studio-warning-fg">
          {error.replace(/^Error:\s*/, "")}
        </div>
      ) : null}
    </div>
  );
}
