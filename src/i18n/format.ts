// SIG-964: locale-explicit number formatting for Game Review output.
// Every helper takes SiteLocale and maps to an explicit BCP-47 tag — never
// the runtime default locale (avoids hydration mismatch and Node-vs-browser
// Intl drift).
import type { SiteLocale } from "./locale.ts";

const TAG: Record<SiteLocale, string> = { en: "en-US", "pt-br": "pt-BR" };

/** One decimal, e.g. 86 -> "86.0" (en) / "86,0" (pt-br). */
export function formatDecimal1(locale: SiteLocale, value: number): string {
  return new Intl.NumberFormat(TAG[locale], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Grouped integer, e.g. 2450 -> "2,450" (en) / "2.450" (pt-br). */
export function formatInteger(locale: SiteLocale, value: number): string {
  return new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: 0 }).format(value);
}
