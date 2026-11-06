"use client";

import { useEffect, useState } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { SITE_LOCALES, SITE_LOCALE_LABELS, SITE_LOCALE_SHORT_LABELS, isSiteLocale } from "./locale";
import { tStudioChrome } from "./studio-chrome-strings";

// SIG-962: compact site-language selector rendered in every page chrome
// (MenuBar + CourseChrome). Mirrors the Settings "Site language" row; both
// write the same `settings.locale`.
// SIG-1246: below Tailwind's `sm` (640px) the long labels ("Português (Brasil)")
// push the header past a 320-390px viewport, so options use EN / PT instead.
// The accessible name stays the full language name (option aria-label).
const NARROW_QUERY = "(max-width: 639px)";

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function LocaleSwitcher() {
  const narrow = useNarrowViewport();
  const locale = useStudioStore((state) => state.settings.locale);
  const setLocale = useStudioStore((state) => state.setLocale);

  return (
    <select
      value={locale}
      aria-label={tStudioChrome(locale, "chrome.locale.siteLanguage")}
      onChange={(event) => {
        if (isSiteLocale(event.target.value)) {
          setLocale(event.target.value);
        }
      }}
      className="h-7 shrink-0 rounded-md border border-studio-border-strong bg-studio-panel px-1.5 text-dense text-studio-fg"
    >
      {SITE_LOCALES.map((id) => (
        <option key={id} value={id} aria-label={SITE_LOCALE_LABELS[id]}>
          {narrow ? SITE_LOCALE_SHORT_LABELS[id] : SITE_LOCALE_LABELS[id]}
        </option>
      ))}
    </select>
  );
}
