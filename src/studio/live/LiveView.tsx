"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { tLive } from "@/src/i18n/live-strings";
import { parseLiveUrlState, withLiveUrlState } from "@/src/studio/workspace-view-url";
import { Button } from "@/src/studio/ui/Button";
import { BroadcastList } from "./BroadcastList";

/** SIG-1290: Live center view. The list is here; the round view arrives in SIG-1291 (5/7). */
export function LiveView() {
  const locale = useStudioStore((state) => state.settings.locale);
  const [roundId, setRoundId] = useState<string | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    const sync = () => setRoundId(parseLiveUrlState(window.location.search).round);
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const open = useCallback((id: string) => {
    const search = withLiveUrlState(window.location.search, { round: id });
    window.history.pushState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    pushed.current = true;
    setRoundId(id);
  }, []);

  const back = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back(); // popstate returns to the list entry
      return;
    }
    const search = withLiveUrlState(window.location.search, {});
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
    setRoundId(null);
  }, []);

  return (
    <section
      aria-label={tStudioChrome(locale, "chrome.activity.live")}
      data-live-view=""
      className="h-full bg-studio-bg"
    >
      {roundId ? (
        <div className="grid h-full place-items-center content-center gap-3 p-6 text-center text-sm text-studio-muted">
          <h1 className="text-base font-semibold text-studio-fg">{tLive(locale, "live.round.title", { id: roundId })}</h1>
          <p>{tLive(locale, "live.round.placeholder")}</p>
          <Button onClick={back}>
            <ArrowLeft size={14} aria-hidden="true" />
            {tLive(locale, "live.round.back")}
          </Button>
        </div>
      ) : (
        <BroadcastList locale={locale} onOpen={open} />
      )}
    </section>
  );
}
