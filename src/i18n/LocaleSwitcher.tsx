"use client";

import { useStudioStore } from "@/src/store/studio-store";
import { SITE_LOCALES, SITE_LOCALE_LABELS, isSiteLocale } from "./locale";
import { tStudioChrome } from "./studio-chrome-strings";

// SIG-962: compact site-language selector rendered in every page chrome
// (MenuBar + CourseChrome). Mirrors the Settings "Site language" row; both
// write the same `settings.locale`.
export function LocaleSwitcher() {
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
        <option key={id} value={id}>
          {SITE_LOCALE_LABELS[id]}
        </option>
      ))}
    </select>
  );
}
