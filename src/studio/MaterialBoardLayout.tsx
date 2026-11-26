import type { ReactNode } from "react";
import type { PieceRenderObject } from "react-chessboard";
import { materialBalance, type MaterialColor } from "@/src/chess/material";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPanels } from "@/src/i18n/studio-panel-strings";

const MOVE_NAV_ROW_HEIGHT = "2.5rem";
const STRIP_HEIGHT = "1.375rem";
export const MATERIAL_STRIPS_HEIGHT = `2 * ${STRIP_HEIGHT}`;

const pieceLabels = {
  Q: "panels.board.promoteQueen",
  R: "panels.board.promoteRook",
  B: "panels.board.promoteBishop",
  N: "panels.board.promoteKnight",
  P: "panels.board.pawn",
} as const;

export function MaterialBoardLayout({
  children,
  evalBar,
  moveNavBar,
  showMaterialBalance,
  fen,
  orientation,
  pieces,
  locale,
}: {
  children: ReactNode;
  evalBar?: ReactNode;
  moveNavBar?: ReactNode;
  showMaterialBalance: boolean;
  fen: string;
  orientation: "white" | "black";
  pieces: PieceRenderObject;
  locale: SiteLocale;
}) {
  const balance = showMaterialBalance ? materialBalance(fen) : null;
  const bottom = orientation === "white" ? "w" : "b";
  const top = bottom === "w" ? "b" : "w";
  const boardAreaHeight = moveNavBar ? `calc(100cqh - ${MOVE_NAV_ROW_HEIGHT})` : "100cqh";
  // At the dock's minimum height, leave room for the board as well as both strips.
  const stripHeight = moveNavBar
    ? `max(0px, min(${STRIP_HEIGHT}, calc(${boardAreaHeight} / 3)))`
    : STRIP_HEIGHT;
  const height = balance ? `calc(${boardAreaHeight} - 2 * ${stripHeight})` : boardAreaHeight;
  const width = evalBar ? "calc(100cqw - 1.625rem)" : "100cqw";
  const boardSize = `max(0px, min(${height}, ${width}))`;
  const boardRows = balance ? `${stripHeight} ${boardSize} ${stripHeight}` : boardSize;

  function renderStrip(color: MaterialColor, opponent: MaterialColor, row: number) {
    if (!balance) return null;
    const lead = color === "w" ? balance.difference : -balance.difference;
    return (
      <div
        role="group"
        aria-label={tPanels(locale, color === "w" ? "panels.board.whiteCaptures" : "panels.board.blackCaptures")}
        className="flex min-w-0 items-center gap-1 overflow-hidden text-caption tabular-nums text-studio-muted"
        style={{ gridColumn: -2, gridRow: row }}
      >
        {balance.captured[color].map(({ piece, count }) => {
          const Icon = pieces[`${opponent}${piece}`];
          const label = tPanels(locale, pieceLabels[piece]);
          return (
            <span key={piece} className="flex min-w-0 items-center" role="img" aria-label={`${label} ×${count}`}>
              <span aria-hidden="true" className="grid size-4 min-w-0 place-items-center">
                <Icon svgStyle={{ width: "100%", height: "100%" }} />
              </span>
              {count > 1 ? <span aria-hidden="true">{count}</span> : null}
            </span>
          );
        })}
        {lead > 0 ? <span className="shrink-0 font-semibold text-studio-fg">+{lead}</span> : null}
      </div>
    );
  }

  return (
    <div
      className="grid gap-x-1.5"
      style={{
        gridTemplateColumns: evalBar ? `1.25rem ${boardSize}` : boardSize,
        gridTemplateRows: moveNavBar ? `${boardRows} ${MOVE_NAV_ROW_HEIGHT}` : boardRows,
      }}
    >
      {renderStrip(top, bottom, 1)}
      {evalBar ? (
        <div className="flex" style={{ gridColumn: 1, gridRow: balance ? 2 : 1 }}>{evalBar}</div>
      ) : null}
      <div className="min-h-0 min-w-0" style={{ gridColumn: -2, gridRow: balance ? 2 : 1 }}>
        {children}
      </div>
      {renderStrip(bottom, top, 3)}
      {moveNavBar ? (
        <div
          className="flex min-w-0 items-end justify-self-center"
          style={{ gridColumn: -2, gridRow: -2, width: "max-content", maxWidth: width }}
        >
          {moveNavBar}
        </div>
      ) : null}
    </div>
  );
}
