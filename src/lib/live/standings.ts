import type { SiteLocale } from "@/src/i18n/locale";
import type { BroadcastStandingRow } from "./types";

export function findStandingRow(
  rows: readonly BroadcastStandingRow[],
  { fideId, name }: { fideId?: number | null; name: string },
): BroadcastStandingRow | undefined {
  const byId = fideId == null ? undefined : rows.find((row) => row.fideId === fideId);
  return byId ?? rows.find((row) => row.name === name);
}

export function formatScore(score: number, locale: SiteLocale): string {
  if (score % 1 === 0.5) {
    return `${Math.floor(score) || ""}½`;
  }
  return score.toLocaleString(locale);
}
