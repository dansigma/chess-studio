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

/**
 * SIG-1192: game counts in explorer tables. Exact and grouped below 10,000
 * ("1,336" / "1.336"), compact above ("12.3K" / "12,3 mil").
 */
export function formatGameCount(locale: SiteLocale, value: number): string {
  if (Math.abs(value) < 10_000) {
    return formatInteger(locale, value);
  }
  return new Intl.NumberFormat(TAG[locale], { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/**
 * SIG-1220: a time span for the review's time metrics: "640ms" under one
 * second, "1.3s" (pt-BR "1,3s") under a minute, "1m 12s" from a minute on.
 */
export function formatDuration(locale: SiteLocale, ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (safe < 1000) {
    return `${Math.min(999, Math.round(safe))}ms`;
  }
  // Round to tenths first, so 59.96 s reads "1m 0s" instead of "60.0s".
  const tenths = Math.round(safe / 100);
  if (tenths < 600) {
    return `${formatDecimal1(locale, tenths / 10)}s`;
  }
  const seconds = Math.round(safe / 1000);
  return `${formatInteger(locale, Math.floor(seconds / 60))}m ${formatInteger(locale, seconds % 60)}s`;
}
