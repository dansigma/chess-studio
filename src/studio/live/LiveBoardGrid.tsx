"use client";

import { tLive } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { useIsMobile } from "../use-is-mobile";
import { LiveBoard } from "./LiveBoard";
import { sameGameRef, useLiveStore } from "./live-store";
import { MAX_LIVE_BOARDS } from "./live-board-model";
import { useLiveEvalPref } from "./use-live-eval-pref";

function SwitcherLabel({ roundId, gameId }: { roundId: string; gameId: string }) {
  const name = useLiveStore((s) => {
    const g = s.gamesByRound[roundId]?.[gameId];
    return g ? `${g.white.name} – ${g.black.name}` : gameId;
  });
  return <>{name}</>;
}

/**
 * The open boards. Desktop: a grid of equal cards, 1/2/3 columns by the width of this pane (container
 * queries, not the viewport: the pane is the window minus the games table), so a newly opened or focused
 * board never stretches across the row; the focused one is marked by its ring and carries the eval bar.
 * Mobile: only the focused board, with a selector between the followed games.
 * Boards come from the store; closing calls `closeBoard`, clicking a board calls `focusBoard`.
 */
export function LiveBoardGrid({ locale }: { locale: SiteLocale }) {
  const openBoards = useLiveStore((s) => s.openBoards);
  const focusedGame = useLiveStore((s) => s.focusedGame);
  const focusBoard = useLiveStore((s) => s.focusBoard);
  const closeBoard = useLiveStore((s) => s.closeBoard);
  const limitReached = useLiveStore((s) => s.boardLimitReached);
  const mobile = useIsMobile();
  const [showEval, setShowEval] = useLiveEvalPref();

  if (openBoards.length === 0) {
    return null;
  }
  const shown = mobile ? openBoards.filter((b) => sameGameRef(b, focusedGame ?? openBoards[0] ?? null)) : openBoards;
  return (
    <section aria-label={tLive(locale, "live.boards.label")} className="@container flex min-w-0 flex-col gap-3 p-3" data-live-boards="">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
        {limitReached ? (
          <p role="status" className="text-dense text-studio-warning-fg" data-live-board-limit="">
            {tLive(locale, "live.board.limit", { max: MAX_LIVE_BOARDS })}
          </p>
        ) : null}
      </div>
      {mobile && openBoards.length > 1 ? (
        <div role="tablist" aria-label={tLive(locale, "live.board.switcher")} className="flex gap-1 overflow-x-auto">
          {openBoards.map((ref) => {
            const selected = sameGameRef(ref, focusedGame ?? openBoards[0] ?? null);
            return (
              <button
                key={`${ref.roundId}:${ref.gameId}`}
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
      <div
        // Thresholds keep a card >= 16rem: 2 cols from 36rem (~17.6rem each), 3 from 56rem (~17.5rem each).
        className={mobile ? "flex flex-col" : "grid grid-cols-1 items-stretch gap-3 @xl:grid-cols-2 @4xl:grid-cols-3"}
        data-live-board-grid=""
      >
        {shown.map((ref) => {
          const focused = sameGameRef(ref, focusedGame);
          return (
            <div key={`${ref.roundId}:${ref.gameId}`} className="min-w-0 [&>article]:h-full">
              <LiveBoard
                roundId={ref.roundId}
                gameId={ref.gameId}
                focused={focused}
                showEval={showEval}
                locale={locale}
                onFocus={() => (focused ? undefined : focusBoard(ref))}
                onClose={() => closeBoard(ref)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
