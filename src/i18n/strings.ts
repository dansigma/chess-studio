// SIG-962: site string catalog. Nav-only seed; typed `t(locale, key)` with
// English fallback (same grain as src/chess/explain/render.ts).
import type { SiteLocale } from "./locale";

export const SITE_STRING_KEYS = ["nav.courses", "nav.puzzles", "nav.studio"] as const;
export type SiteStringKey = (typeof SITE_STRING_KEYS)[number];

const EN: Record<SiteStringKey, string> = {
  "nav.courses": "Courses",
  "nav.puzzles": "Puzzles",
  "nav.studio": "Studio",
};

const PT_BR: Partial<Record<SiteStringKey, string>> = {
  "nav.courses": "Cursos",
  "nav.puzzles": "Exercícios",
  "nav.studio": "Estúdio",
};

const TABLES: Record<SiteLocale, Partial<Record<SiteStringKey, string>>> = {
  en: EN,
  "pt-br": PT_BR,
};

function warnMissing(locale: SiteLocale, key: SiteStringKey): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[i18n] missing ${locale} text for "${key}", using English`);
  }
}

export function t(locale: SiteLocale, key: SiteStringKey): string {
  const text = TABLES[locale][key];
  if (text !== undefined) {
    return text;
  }
  warnMissing(locale, key);
  return EN[key];
}
