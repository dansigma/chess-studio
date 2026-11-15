"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import {
  arrowsForRender,
  colorFromModifiers,
  emptyMarks,
  marksAreEmpty,
  toggleArrowMark,
  toggleSquareMark,
  type BoardMarks,
  type MarkColor,
} from "@/src/chess/marks";
import { importPgn } from "@/src/chess/pgn";
import { moveNumberForPath, plyColor } from "@/src/chess/tree";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { Button } from "@/src/studio/ui/Button";
import { linePositions, setMarksOnMainlineMove } from "../line-marks";
import { StudyBoard } from "./StudyBoard";

type PendingMark = { square: string; color: MarkColor };
type PreviewArrow = { from: string; to: string; color: MarkColor };

/**
 * SIG-1367: a mini-board for one line. The author steps through the mainline
 * and draws arrows/highlights; each change is written back to the line's PGN
 * as `[%cal]`/`[%csl]`, so the study screen and the PGN box see the same data.
 */
export function LineMarksEditor({
  id,
  pgn,
  locale,
  onPgn,
}: {
  /** Unique board id (the variation id). */
  id: string;
  pgn: string;
  locale: SiteLocale;
  onPgn: (pgn: string) => void;
}) {
  const tree = useMemo(() => importPgn(pgn).tree, [pgn]);
  const positions = useMemo(() => linePositions(tree), [tree]);
  const lastPly = positions.length - 1;
  const [selected, setSelected] = useState(lastPly);
  const ply = Math.min(selected, lastPly);
  const position = positions[ply];
  const pending = useRef<PendingMark | null>(null);
  const [preview, setPreview] = useState<PreviewArrow | null>(null);

  // A blank line has no moves to draw on; exporting it would overwrite the
  // author's text with an empty game, so the board waits for a playable line.
  if (!position || lastPly === 0) {
    return null;
  }

  const marks = position.marks;
  const saveMarks = (next: BoardMarks) => {
    onPgn(setMarksOnMainlineMove(pgn, ply, next));
  };

  function mouseDown(square: string, event: MouseEvent) {
    if (event.button !== 2) {
      return;
    }
    pending.current = { square, color: colorFromModifiers(event) };
  }

  function mouseUp(square: string, event: MouseEvent) {
    if (event.button !== 2) {
      return;
    }
    const start = pending.current;
    pending.current = null;
    setPreview(null);
    if (!start) {
      return;
    }
    const base = marks ?? emptyMarks();
    const next =
      start.square === square
        ? toggleSquareMark(base, square, start.color)
        : toggleArrowMark(base, start.square, square, start.color);
    if (next !== base) {
      saveMarks(next);
    }
  }

  function hoverSquare(square: string) {
    const start = pending.current;
    if (!start || start.square === square) {
      setPreview(null);
      return;
    }
    setPreview({ from: start.square, to: square, color: start.color });
  }

  return (
    <div className="mt-3 flex flex-wrap items-start gap-3 border-t border-studio-border pt-3">
      <div
        role="group"
        aria-label={tCourseAdmin(locale, "course.admin.line.board.label")}
        className="w-52 max-w-full shrink-0"
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="aspect-square">
          <StudyBoard
            id={`line-marks-${id}`}
            fen={position.fen}
            orientation="white"
            marks={marks}
            arrows={preview ? arrowsForRender([], preview) : []}
            onSquareMouseDown={mouseDown}
            onSquareMouseUp={mouseUp}
            onMouseOverSquare={hoverSquare}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5 font-mono"
            aria-label={tCourseAdmin(locale, "course.admin.line.board.start")}
            disabled={ply === 0}
            onClick={() => setSelected(0)}
          >
            {"|<"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5 font-mono"
            aria-label={tCourseAdmin(locale, "course.admin.line.board.previous")}
            disabled={ply === 0}
            onClick={() => setSelected(ply - 1)}
          >
            {"<"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5 font-mono"
            aria-label={tCourseAdmin(locale, "course.admin.line.board.next")}
            disabled={ply === lastPly}
            onClick={() => setSelected(ply + 1)}
          >
            {">"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-1.5 font-mono"
            aria-label={tCourseAdmin(locale, "course.admin.line.board.end")}
            disabled={ply === lastPly}
            onClick={() => setSelected(lastPly)}
          >
            {">|"}
          </Button>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <ol
          aria-label={tCourseAdmin(locale, "course.admin.line.board.moves")}
          className="flex max-h-24 flex-wrap gap-1 overflow-y-auto"
        >
          {positions.slice(1).map((item) => {
            const active = item.ply === ply;
            const white = plyColor(tree.startFen, item.ply) === "w";
            return (
              <li key={item.ply}>
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => setSelected(item.ply)}
                  className={`rounded px-1.5 py-0.5 text-dense ${
                    active
                      ? "bg-studio-selected text-studio-fg"
                      : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
                  }`}
                >
                  {white ? (
                    <span className="text-studio-faint">
                      {moveNumberForPath(tree.startFen, item.ply)}.
                    </span>
                  ) : null}{" "}
                  {item.san}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={marksAreEmpty(marks)}
            onClick={() => saveMarks(emptyMarks())}
          >
            {tCourseAdmin(locale, "course.admin.line.board.clear")}
          </Button>
        </div>
        {ply === lastPly ? (
          <div role="note" className="rounded-lg border border-studio-border bg-studio-bg px-2.5 py-2">
            <p className="text-body font-semibold text-studio-fg">
              {tCourseAdmin(locale, "course.admin.line.board.plan")}
            </p>
            <p className="text-caption text-studio-muted">
              {tCourseAdmin(locale, "course.admin.line.board.planHint")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
