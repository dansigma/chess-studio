"use client";

import { useState, type DragEvent } from "react";
import { tLive, type LiveStringKey } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { useIsMobile } from "../use-is-mobile";
import { LiveBoard, type LiveBoardVariant } from "./LiveBoard";
import { sameGameRef, useLiveStore } from "./live-store";
import { compactGridShape, MAX_LIVE_BOARDS } from "./live-board-model";
import { LIVE_LAYOUTS, useLiveLayoutPref, type LiveLayout } from "./use-live-layout-pref";
import { useLiveEvalPref } from "./use-live-eval-pref";
import type { LiveGameRef } from "../workspace-view-url";
import { Button } from "../ui/Button";

const LAYOUT_LABEL_KEYS: Record<LiveLayout, LiveStringKey> = {
  grid: "live.layout.grid",
  compact: "live.layout.compact",
  focus: "live.layout.focus",
};

const refKey = (ref: LiveGameRef) => `${ref.roundId}:${ref.gameId}`;

function SwitcherLabel({ roundId, gameId }: { roundId: string; gameId: string }) {
  const name = useLiveStore((s) => {
    const g = s.gamesByRound[roundId]?.[gameId];
    return g ? `${g.white.name} – ${g.black.name}` : gameId;
  });
  return <>{name}</>;
}

/**
 * The open boards. Desktop, by the layout the user picked (remembered on this device):
 *  - Grid: equal cards with notation, 1/2/3 columns by the width of this pane (container queries, not the
 *    viewport: the pane is the window minus the games table), so a newly opened board never stretches across the row.
 *  - Compact: no notation, cards sized to fill the pane height (2x2 up to 4 boards, 3x2 for 5-6), no vertical scroll.
 *  - Focus: the focused board large with its notation, the others as thumbnails; clicking one focuses it.
 * Cards are reordered by dragging (Grid and Compact); the order is `openBoards`, which is also the URL `games=`
 * order and the sidebar's numbering. The focused card is marked by its ring and carries the engine eval bar.
 * Mobile: only the focused board, with a selector between the followed games.
 */
export function LiveBoardGrid({ locale }: { locale: SiteLocale }) {
  const openBoards = useLiveStore((s) => s.openBoards);
  const focusedGame = useLiveStore((s) => s.focusedGame);
  const focusBoard = useLiveStore((s) => s.focusBoard);
  const closeBoard = useLiveStore((s) => s.closeBoard);
  const closeAllBoards = useLiveStore((s) => s.closeAllBoards);
  const moveBoard = useLiveStore((s) => s.moveBoard);
  const limitReached = useLiveStore((s) => s.boardLimitReached);
  const mobile = useIsMobile();
  const [showEval, setShowEval] = useLiveEvalPref();
  const [layout, setLayout] = useLiveLayoutPref();
  // Flip is per card and lives here, so a card keeps its side when a layout change remounts it.
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (openBoards.length === 0) {
    return null;
  }
  const effectiveFocus = focusedGame ?? openBoards[0] ?? null;
  const shown = mobile ? openBoards.filter((b) => sameGameRef(b, effectiveFocus)) : openBoards;
  const activeLayout: LiveLayout = mobile ? "grid" : layout;
  const reorderable = !mobile && activeLayout !== "focus" && openBoards.length > 1;

  const renderBoard = (ref: LiveGameRef, variant: LiveBoardVariant) => {
    // The Focus layout's large card is the focused one even before the user clicked (focus null = first board).
    const focused = sameGameRef(ref, activeLayout === "focus" ? effectiveFocus : focusedGame);
    const key = refKey(ref);
    return (
      <LiveBoard
        roundId={ref.roundId}
        gameId={ref.gameId}
        focused={focused}
        showEval={showEval}
        locale={locale}
        variant={variant}
        flipped={flipped[key] === true}
        onFlip={() => setFlipped((prev) => ({ ...prev, [key]: !prev[key] }))}
        onFocus={() => (focused ? undefined : focusBoard(ref))}
        onClose={() => closeBoard(ref)}
      />
    );
  };

  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };
  const dragHandlers = (index: number) =>
    reorderable
      ? {
          draggable: true,
          onDragStart: (event: DragEvent<HTMLDivElement>) => {
            event.dataTransfer.effectAllowed = "move";
            try {
              // Firefox starts no drag without data.
              event.dataTransfer.setData("text/plain", String(index));
            } catch {
              // Some environments refuse; the state below is what the drop reads.
            }
            setDragFrom(index);
          },
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            if (dragFrom === null) {
              return; // not one of our cards (a file, a link): leave the browser's default
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (dragOver !== index) {
              setDragOver(index);
            }
          },
          onDrop: (event: DragEvent<HTMLDivElement>) => {
            if (dragFrom === null) {
              return;
            }
            event.preventDefault();
            moveBoard(dragFrom, index);
            endDrag();
          },
          onDragEnd: endDrag,
        }
      : {};
  const cardWrapper = (ref: LiveGameRef, index: number, variant: LiveBoardVariant) => (
    <div
      key={refKey(ref)}
      className={`min-h-0 min-w-0 [&>article]:h-full ${dragFrom === index ? "opacity-50" : ""} ${
        dragFrom !== null && dragOver === index && dragFrom !== index ? "rounded-xl ring-2 ring-studio-accent" : ""
      }`}
      data-live-card={refKey(ref)}
      data-drop-target={dragFrom !== null && dragOver === index && dragFrom !== index ? "" : undefined}
      {...dragHandlers(index)}
    >
      {renderBoard(ref, variant)}
    </div>
  );

  const compactShape = compactGridShape(shown.length);
  return (
    <section
      aria-label={tLive(locale, "live.boards.label")}
      className={`@container flex min-w-0 flex-col gap-3 p-3 ${activeLayout === "compact" || activeLayout === "focus" ? "h-full" : ""}`}
      data-live-boards=""
      data-live-layout={activeLayout}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
        <label className="flex items-center gap-1.5 text-dense text-studio-muted hover:text-studio-fg">
          <input
            type="checkbox"
            checked={showEval}
            onChange={(event) => setShowEval(event.target.checked)}
            className="accent-[var(--color-studio-accent)]"
            data-live-eval-toggle=""
          />
          {tLive(locale, "live.eval.toggle")}
        </label>
        {mobile ? null : (
          <div
            role="radiogroup"
            aria-label={tLive(locale, "live.layout.label")}
            className="inline-flex rounded-md border border-studio-border p-0.5"
            data-live-layout-selector=""
          >
            {LIVE_LAYOUTS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={layout === option}
                onClick={() => setLayout(option)}
                data-live-layout-option={option}
                className={`h-6 rounded px-2 text-dense ${
                  layout === option ? "bg-studio-selected text-studio-fg" : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
                }`}
              >
                {tLive(locale, LAYOUT_LABEL_KEYS[option])}
              </button>
            ))}
          </div>
        )}
        {limitReached ? (
          <p role="status" className="text-dense text-studio-warning-fg" data-live-board-limit="">
            {tLive(locale, "live.board.limit", { max: MAX_LIVE_BOARDS })}
          </p>
        ) : null}
        {!mobile && openBoards.length >= 2 ? (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={closeAllBoards} data-live-clear-grid="">
            {tLive(locale, "live.grid.clear")}
          </Button>
        ) : null}
      </div>
      {mobile && openBoards.length > 1 ? (
        <div role="tablist" aria-label={tLive(locale, "live.board.switcher")} className="flex gap-1 overflow-x-auto">
          {openBoards.map((ref) => {
            const selected = sameGameRef(ref, effectiveFocus);
            return (
              <button
                key={refKey(ref)}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => focusBoard(ref)}
                className={`shrink-0 rounded-md px-2 py-1 text-dense ${
                  selected ? "bg-studio-selected text-studio-fg" : "text-studio-muted hover:bg-studio-hover"
                }`}
              >
                <SwitcherLabel roundId={ref.roundId} gameId={ref.gameId} />
              </button>
            );
          })}
        </div>
      ) : null}
      {mobile ? (
        <div className="flex flex-col" data-live-board-grid="">
          {shown.map((ref) => (
            <div key={refKey(ref)} className="min-w-0 [&>article]:h-full">
              {renderBoard(ref, "full")}
            </div>
          ))}
        </div>
      ) : activeLayout === "focus" ? (
        <div className="flex min-h-[32rem] flex-1 gap-3" data-live-board-grid="">
          {effectiveFocus ? <div className="min-h-0 min-w-0 flex-1 [&>article]:h-full">{renderBoard(effectiveFocus, "focus")}</div> : null}
          {openBoards.length > 1 ? (
            <div
              className="flex w-40 shrink-0 flex-col gap-3 overflow-y-auto @3xl:w-56"
              data-live-thumbs=""
            >
              {openBoards
                .filter((ref) => !sameGameRef(ref, effectiveFocus))
                .map((ref) => (
                  <div key={refKey(ref)} className="shrink-0" data-live-card={refKey(ref)}>
                    {renderBoard(ref, "thumb")}
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : activeLayout === "compact" ? (
        <div
          className="grid min-h-[22rem] flex-1 items-stretch gap-3"
          style={{
            gridTemplateColumns: `repeat(${compactShape.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${compactShape.rows}, minmax(0, 1fr))`,
          }}
          data-live-board-grid=""
        >
          {openBoards.map((ref, index) => cardWrapper(ref, index, "compact"))}
        </div>
      ) : (
        <div
          // Thresholds keep a card >= 16rem: 2 cols from 36rem (~17.6rem each), 3 from 56rem (~17.5rem each).
          className="grid grid-cols-1 items-stretch gap-3 @xl:grid-cols-2 @4xl:grid-cols-3"
          data-live-board-grid=""
        >
          {openBoards.map((ref, index) => cardWrapper(ref, index, "full"))}
        </div>
      )}
    </section>
  );
}
