"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Chessboard, type PieceRenderObject } from "react-chessboard";
import { Eraser, MousePointer2 } from "lucide-react";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { tLibrary } from "@/src/i18n/library-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import {
  BLACK_SETUP_PIECES,
  WHITE_SETUP_PIECES,
  buildSetupFen,
  enPassantCandidates,
  moveSetupPiece,
  parseSetupFen,
  placeSetupPiece,
  type SetupPiece,
  type SetupPosition,
} from "@/src/chess/setup-fen";
import { boardCoordinateOptions, boardSquareStyles } from "@/src/chess/board-themes";
import { piecesForSet } from "@/src/chess/piece-sets";
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

export type PositionEditorProps = {
  /** Current FEN. Edits are reported through `onChange` as a normalized FEN. */
  value: string;
  onChange: (fen: string) => void;
  /** Validation message shown under the editor; `null` hides it. */
  error: string | null;
  locale: SiteLocale;
  orientation: "white" | "black";
  boardTheme: Parameters<typeof boardSquareStyles>[0];
  pieceSet: Parameters<typeof piecesForSet>[0];
  showCoordinates: boolean;
  /** Unique per instance: react-chessboard keys its internal state on it. */
  boardId: string;
  /** Adds castling-rights checkboxes and an en passant selector. */
  advanced?: boolean;
  /** Extra buttons at the start / end of the tool row (Apply, Close, …). */
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  className?: string;
};

/**
 * Prop-driven board editor (no store access). Shared by the Studio setup panel
 * and the Library "Definir posição…" dialog.
 */
export function PositionEditor({
  value,
  onChange,
  error,
  locale,
  orientation,
  boardTheme,
  pieceSet,
  showCoordinates,
  boardId,
  advanced = false,
  toolbarStart,
  toolbarEnd,
  className = "flex h-full min-h-0 w-full flex-col overflow-hidden bg-studio-panel",
}: PositionEditorProps) {
  const parse = (fen: string): SetupPosition => {
    const parsed = parseSetupFen(fen);
    return advanced ? parsed : { ...parsed, enPassant: undefined };
  };
  const [position, setPosition] = useState<SetupPosition>(() => parse(value));
  const [tool, setTool] = useState<Tool>("cursor");
  const [held, setHeld] = useState<string | null>(null);
  const [fenText, setFenText] = useState(() => buildSetupFen(parse(value)));
  const fen = buildSetupFen(position);
  const theme = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);

  // A value that did not come from our own edits (shortcuts, a pasted FEN upstream) replaces the position.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== fen) {
      setPosition(parse(value));
    }
  }

  const [syncedFen, setSyncedFen] = useState(fen);
  if (syncedFen !== fen) {
    setSyncedFen(fen);
    setFenText(fen);
  }

  const squareStyles = useMemo(() => {
    if (!held) {
      return {};
    }
    return { [held]: { boxShadow: "inset 0 0 0 3px rgba(255, 255, 255, 0.55)" } };
  }, [held]);

  function commit(next: SetupPosition) {
    setPosition(next);
    const nextFen = buildSetupFen(next);
    if (nextFen !== fen) {
      onChange(nextFen);
    }
  }

  function applyFenText() {
    commit(parse(fenText));
  }

  const rights = fen.split(" ")[2] ?? "-";
  const available = (right: string) => {
    const p = position.pieces;
    return (
      (right === "K" && p.e1 === "wK" && p.h1 === "wR") ||
      (right === "Q" && p.e1 === "wK" && p.a1 === "wR") ||
      (right === "k" && p.e8 === "bK" && p.h8 === "bR") ||
      (right === "q" && p.e8 === "bK" && p.a8 === "bR")
    );
  };
  function toggleRight(right: string) {
    let next = "";
    for (const r of "KQkq") {
      const on = r === right ? !rights.includes(r) : rights.includes(r);
      if (on) {
        next += r;
      }
    }
    commit({ ...position, castling: next || "-" });
  }
  const epOptions = advanced ? enPassantCandidates(position.pieces, position.turn) : [];
  const epValue = fen.split(" ")[3] ?? "-";

  return (
    <div className={className}>
      <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1.5">
        {toolbarStart}
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
        {toolbarEnd}
      </div>
      <div className="flex items-center gap-1 border-b border-studio-border-subtle px-2 py-1">
        {WHITE_SETUP_PIECES.map((piece) => (
          <PieceButton key={piece} piece={piece} active={tool === piece} pieces={pieces} onClick={() => setTool(piece)} />
        ))}
        <span className="mx-1 h-5 w-px bg-studio-border-strong" />
        {BLACK_SETUP_PIECES.map((piece) => (
          <PieceButton key={piece} piece={piece} active={tool === piece} pieces={pieces} onClick={() => setTool(piece)} />
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
              id: `${boardId}-${pieceSet}`,
              position: fen,
              boardOrientation: orientation,
              showNotation: showCoordinates,
              ...boardCoordinateOptions(boardTheme),
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
      {advanced ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-studio-border px-2 py-1.5 text-caption text-studio-muted">
          <span className="font-medium">{tLibrary(locale, "library.position.castling")}</span>
          {(["K", "Q", "k", "q"] as const).map((right) => (
            <label key={right} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={rights.includes(right)}
                disabled={!available(right)}
                onChange={() => toggleRight(right)}
              />
              {tLibrary(
                locale,
                right === "K"
                  ? "library.position.castleWK"
                  : right === "Q"
                    ? "library.position.castleWQ"
                    : right === "k"
                      ? "library.position.castleBK"
                      : "library.position.castleBQ",
              )}
            </label>
          ))}
          <label className="ml-auto inline-flex items-center gap-1">
            {tLibrary(locale, "library.position.enPassant")}
            <select
              value={epValue}
              disabled={epOptions.length === 0}
              onChange={(event) => commit({ ...position, enPassant: event.target.value === "-" ? undefined : event.target.value })}
              className="h-6 rounded-md border border-studio-border bg-studio-bg px-1 text-caption text-studio-fg disabled:text-studio-disabled"
            >
              <option value="-">{tLibrary(locale, "library.position.enPassantNone")}</option>
              {epOptions.map((square) => (
                <option key={square} value={square}>
                  {square}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
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
          aria-label={tPanels(locale, "panels.setup.pasteFen")}
          placeholder={tPanels(locale, "panels.setup.pasteFen")}
          className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-studio-selected px-2 font-mono text-caption text-studio-fg outline-none focus:border-studio-accent"
        />
      </div>
      {error ? (
        <div
          role="alert"
          className="border-t border-studio-border-subtle bg-studio-warning-bg px-2 py-1.5 text-caption text-studio-warning-fg"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
