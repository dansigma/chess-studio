"use client";

import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { LIVE_CONNECTION_LABEL_KEYS } from "./live-connection";
import { useLiveStore } from "./live-store";

const DOT: Record<string, string> = {
  live: "bg-studio-success animate-pulse",
  polling: "bg-studio-accent",
  connecting: "bg-studio-accent animate-pulse",
  paused: "bg-studio-muted",
  idle: "bg-studio-muted",
  "rate-limited": "bg-studio-warning-fg",
  error: "bg-studio-warning-fg",
};

/** Dot + label for the Live connection state; Live 5/7 and 6/7 decide where it goes. */
export function LiveConnectionIndicator() {
  const locale = useStudioStore((state) => state.settings.locale);
  const connection = useLiveStore((s) => s.connection);
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-caption text-studio-muted" data-live-connection={connection}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[connection]}`} aria-hidden="true" />
      {tStudioChrome(locale, LIVE_CONNECTION_LABEL_KEYS[connection])}
    </span>
  );
}
