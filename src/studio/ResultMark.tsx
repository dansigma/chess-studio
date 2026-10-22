"use client";

import type { SiteLocale } from "../i18n/locale.ts";
import { tPanels } from "../i18n/studio-panel-strings.ts";
import { useStudioStore } from "../store/studio-store.ts";

export type ResultWinner = "white" | "black" | "draw" | null;

/** Single source for PGN `Result` header → winner mapping (`1-0/0-1/1/2-1/2`, else null). */
export function pgnResultToWinner(result: string | undefined): ResultWinner {
  if (result === "1-0") {
    return "white";
  }
  if (result === "0-1") {
    return "black";
  }
  if (result === "1/2-1/2") {
    return "draw";
  }
  return null;
}

/** Single source for winner → caption text (mark + label shown in the notation footer). */
export function resultCaptionForWinner(
  winner: ResultWinner,
  locale: SiteLocale = "en",
): { mark: string; label: string } | null {
  if (winner === "white") {
    return { mark: "1-0", label: tPanels(locale, "result.whiteWins") };
  }
  if (winner === "black") {
    return { mark: "0-1", label: tPanels(locale, "result.blackWins") };
  }
  if (winner === "draw") {
    return { mark: "½-½", label: tPanels(locale, "result.draw") };
  }
  return null;
}

/** Canonical PGN result caption: winner plus its display mark/label (null when no result). */
export function pgnResultCaption(
  result: string | undefined,
  locale: SiteLocale = "en",
): {
  winner: ResultWinner;
  mark: string;
  label: string;
} | null {
  const winner = pgnResultToWinner(result);
  const caption = resultCaptionForWinner(winner, locale);
  return caption ? { winner, ...caption } : null;
}

export function ResultMark({ winner }: { winner: ResultWinner }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const label =
    winner === "white"
      ? tPanels(locale, "result.whiteWins")
      : winner === "black"
        ? tPanels(locale, "result.blackWins")
        : winner === "draw"
          ? tPanels(locale, "result.draw")
          : undefined;
  if (winner === "white") {
    return (
      <span className="text-studio-fg" title={label}>
        1-0
      </span>
    );
  }
  if (winner === "black") {
    return (
      <span className="text-studio-muted" title={label}>
        0-1
      </span>
    );
  }
  return (
    <span className="text-studio-faint" title={label}>
      ½-½
    </span>
  );
}
