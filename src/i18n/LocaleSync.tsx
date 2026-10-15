"use client";

import { useLayoutEffect } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { htmlLangFor } from "./locale";

// SIG-962: keeps <html lang> in sync with settings.locale. Mounted after
// ColorSchemeSync in the root layout so hydrated settings are applied first.
// The pre-hydration value comes from LANG_BOOTSTRAP (same tradeoff as color
// scheme: returning visitors match pre-paint, first visits correct after
// hydration).
export function LocaleSync() {
  const locale = useStudioStore((state) => state.settings.locale);

  useLayoutEffect(() => {
    document.documentElement.lang = htmlLangFor(locale);
  }, [locale]);

  return null;
}
