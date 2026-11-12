"use client";

import { useStudioStore } from "@/src/store/studio-store";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";

/** SIG-1288: placeholder for the Live center view; SIG-1289+ fill it in. */
export function LiveView() {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <section
      aria-label={tStudioChrome(locale, "chrome.activity.live")}
      data-live-view=""
      className="grid h-full place-items-center bg-studio-bg p-6 text-center text-sm text-studio-muted"
    >
      <p>{tStudioChrome(locale, "chrome.live.empty")}</p>
    </section>
  );
}
