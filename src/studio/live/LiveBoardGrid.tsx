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
 * The open boards. Desktop: a grid, the focused board spans two columns (larger) and carries the eval bar. Mobile: only the focused board, with a selector between the followed games.
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
    <section aria-label={tLive(locale, "live.boards.label")} className="flex min-w-0 flex-col gap-2 p-2" data-live-boards="">
      {limitReached ? (
        <p role="status" className="text-dense text-studio-warning-fg" data-live-board-limit="">
          {tLive(locale, "live.board.limit", { max: MAX_LIVE_BOARDS })}
        </p>
      ) : null}
      <label className="flex items-center gap-1.5 self-start text-dense text-studio-muted">
        <input
          type="checkbox"
          checked={showEval}
          onChange={(event) => setShowEval(event.target.checked)}
          data-live-eval-toggle=""
        />
        {tLive(locale, "live.eval.toggle")}
      </label>
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
      <div className={mobile ? "flex flex-col" : "grid grid-cols-2 gap-2 xl:grid-cols-3"}>
        {shown.map((ref) => {
          const focused = sameGameRef(ref, focusedGame);
          return (
            <div
              key={`${ref.roundId}:${ref.gameId}`}
              className={!mobile && focused && openBoards.length > 1 ? "col-span-2" : ""}
            >
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
