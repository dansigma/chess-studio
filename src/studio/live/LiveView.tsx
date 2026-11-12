"use client";

import { useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { BroadcastList } from "./BroadcastList";
import { LiveRoundView } from "./LiveRoundView";
import { useLiveStore } from "./live-store";
import { useLiveUrlSync } from "./use-live-url-sync";

/**
 * Live center view: broadcasts list, or the round view when a round is open. The store owns the
 * selection (`tableRoundId`); `useLiveUrlSync` keeps it and the URL in step and leaves Live on unmount.
 */
export function LiveView() {
  const locale = useStudioStore((state) => state.settings.locale);
  // A link with boards but no table round (`games=` only) opens the round view of the focused board.
  const roundId = useLiveStore((s) => s.tableRoundId ?? s.focusedGame?.roundId ?? s.openBoards[0]?.roundId ?? null);
  const setTableRound = useLiveStore((s) => s.setTableRound);
  const { goBack, ready } = useLiveUrlSync();

  return (
    <section
      aria-label={tStudioChrome(locale, "chrome.activity.live")}
      data-live-view=""
      className="h-full bg-studio-bg"
    >
      {!ready ? null : roundId ? (
        <LiveRoundView roundId={roundId} locale={locale} onBack={goBack} />
      ) : (
        <BroadcastList locale={locale} onOpen={setTableRound} />
      )}
    </section>
  );
}
