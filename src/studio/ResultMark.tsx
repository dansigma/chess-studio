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

// SIG-1192: a fixed-width pill in the ResultBar colours (white / draw /
// black) so the three results differ by more than text colour; before,
// 0-1 and ½-½ shared the same grey.
const RESULT_PILL =
  "inline-flex h-[18px] w-9 shrink-0 items-center justify-center rounded-[4px] text-caption font-semibold tabular-nums";

export function ResultMark({ winner }: { winner: ResultWinner }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const caption = resultCaptionForWinner(winner, locale);
  if (!caption) {
    return <span className={`${RESULT_PILL} text-studio-faint`}>*</span>;
  }
  const tone =
    winner === "white"
      ? "bg-studio-win text-studio-loss ring-1 ring-studio-border-strong"
      : winner === "black"
        ? "bg-studio-loss text-studio-win ring-1 ring-studio-border-strong"
        : "bg-studio-draw text-studio-loss";
  return (
    <span className={`${RESULT_PILL} ${tone}`} title={caption.label}>
      {caption.mark}
    </span>
  );
}
