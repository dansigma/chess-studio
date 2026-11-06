"use client";

import { ExternalLink, Microscope } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { Button } from "@/src/studio/ui/Button";
import { lichessPuzzleUrl } from "./studio-handoff";

// SIG-1236: shown after a puzzle ends (solved or failed).
export function AnalyzeInStudioButton({ locale, onAnalyze }: { locale: SiteLocale; onAnalyze: () => void }) {
  return (
    <Button className="w-full" onClick={onAnalyze}>
      <Microscope className="size-4" aria-hidden />
      {tPuzzle(locale, "puzzle.studio.analyze")}
    </Button>
  );
}

// TODO(SIG-1236, option A): show player names and the game date here by
// storing them at import time from the Lichess game export (the puzzle CSV
// only has the GameUrl, which we do not store). Hidden when there is no link.
export function PuzzleSourceLine({ puzzleId, locale }: { puzzleId: string; locale: SiteLocale }) {
  const href = lichessPuzzleUrl(puzzleId);
  if (!href) {
    return null;
  }
  return (
    <p className="mt-2 text-body text-studio-muted" data-testid="puzzle-source">
      {tPuzzle(locale, "puzzle.source.label")}
      {" · "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-studio-accent-text hover:underline"
      >
        {tPuzzle(locale, "puzzle.source.link")}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </p>
  );
}
