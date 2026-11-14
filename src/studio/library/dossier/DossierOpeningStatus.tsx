"use client";

// SIG-1344: second-line status on a dossier opening card. Crosses the
// opening's main line with the user's repertoire of the opposite colour (the
// player as White is answered by the user's Black repertoire) and shows
// whether that line is covered, only partly covered, or a gap. The status text
// always carries the meaning; the icon and colour only reinforce it.
import { useMemo } from "react";
import { Check, Minus, TriangleAlert } from "lucide-react";
import { tLibrary } from "@/src/i18n/library-strings";
import type { DossierOpeningRow } from "@/src/lib/prep/dossier-openings";
import { lineCoverage, oppositeSide } from "@/src/lib/prep/repertoire-coverage";
import { useStudioStore } from "@/src/store/studio-store";

export type DossierOpeningStatusProps = {
  row: DossierOpeningRow;
  opponentColor: "white" | "black";
};

export function DossierOpeningStatus({ row, opponentColor }: DossierOpeningStatusProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  // The repertoire that answers the player's side is the user's opposite one.
  const repertoireColor = oppositeSide(opponentColor);
  const repertoireTree = useStudioStore(
    (state) => state.boards.find((board) => board.repertoireColor === repertoireColor)?.tree ?? null,
  );
  const coverage = useMemo(
    () => lineCoverage({ path: row.line, opponentColor, repertoireTree }),
    [row.line, opponentColor, repertoireTree],
  );

  if (coverage.status === "no_repertoire") {
    return null;
  }

  const colorName = tLibrary(locale, repertoireColor === "white" ? "library.chip.white" : "library.chip.black");
  const tooltip = tLibrary(locale, "library.dossier.coverage.tooltip", { color: colorName });

  const text =
    coverage.status === "covered"
      ? tLibrary(locale, "library.dossier.coverage.covered")
      : coverage.status === "partial"
        ? tLibrary(locale, "library.dossier.coverage.partial", { move: coverage.label })
        : tLibrary(locale, "library.dossier.coverage.gap", { move: coverage.label });

  const Icon = coverage.status === "covered" ? Check : coverage.status === "partial" ? Minus : TriangleAlert;
  const tone =
    coverage.status === "covered"
      ? "text-studio-success"
      : coverage.status === "partial"
        ? "text-studio-warning-fg"
        : "text-studio-danger";

  return (
    <span
      data-testid="dossier-opening-status"
      data-status={coverage.status}
      title={tooltip}
      className={`inline-flex min-w-0 items-center gap-1 text-caption ${tone}`}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
