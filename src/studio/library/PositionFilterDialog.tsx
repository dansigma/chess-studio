"use client";

import { useState } from "react";
import { tLibrary, type LibraryStringKey } from "@/src/i18n/library-strings";
import { buildSetupFen, emptySetupPosition, parseSetupFen, positionProblem, type PositionProblem } from "@/src/chess/setup-fen";
import { START_FEN } from "@/src/chess/tree";
import { useActiveBoard, useActiveFen } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { PositionEditor } from "../PositionEditor";
import { useLibraryStore } from "./library-store";

const normalize = (fen: string) => buildSetupFen(parseSetupFen(fen));

/** Translated reason a position cannot be searched, or null when it is fine. */
export function positionProblemMessage(
  problem: PositionProblem | null,
  t: (key: LibraryStringKey, vars?: Record<string, string | number>) => string,
): string | null {
  if (!problem) {
    return null;
  }
  switch (problem.code) {
    case "kings":
      return t("library.position.errorKings", { white: problem.white, black: problem.black });
    case "pawnRank":
      return t("library.position.errorPawnRank");
    case "opponentInCheck":
      return t("library.position.errorOpponentInCheck");
    case "invalid":
      return t("library.position.errorInvalid", { message: problem.message });
  }
}

/** SIG-1281: "Definir posição…" — edits `filters.position` on Apply, leaves it alone on Cancel. */
export function PositionFilterDialog({ onClose }: { onClose: () => void }) {
  const settings = useStudioStore((state) => state.settings);
  const orientation = useActiveBoard().orientation;
  const activeFen = useActiveFen();
  const current = useLibraryStore((s) => s.filters.position);
  const setPosition = useLibraryStore((s) => s.setPosition);
  const locale = settings.locale;
  const t = (key: LibraryStringKey, vars?: Record<string, string | number>) => tLibrary(locale, key, vars);
  const [fen, setFen] = useState(() => normalize(current?.fen ?? START_FEN));
  const error = positionProblemMessage(positionProblem(fen), t);

  return (
    <Dialog
      title={t("library.position.dialogTitle")}
      onClose={onClose}
      width="w-[30rem]"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("library.position.cancel")}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={error !== null}
            onClick={() => {
              setPosition({ fen });
              onClose();
            }}
          >
            {t("library.position.apply")}
          </Button>
        </>
      }
    >
      <div data-testid="position-filter-dialog" className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => setFen(normalize(START_FEN))}>
            {t("library.position.start")}
          </Button>
          <Button size="sm" onClick={() => setFen(buildSetupFen(emptySetupPosition()))}>
            {t("library.position.empty")}
          </Button>
          <Button size="sm" onClick={() => setFen(normalize(activeFen))}>
            {t("library.position.useActive")}
          </Button>
        </div>
        <PositionEditor
          advanced
          value={fen}
          onChange={setFen}
          error={error}
          locale={locale}
          orientation={orientation}
          boardTheme={settings.boardTheme}
          pieceSet={settings.pieceSet}
          showCoordinates={settings.showCoordinates}
          boardId="library-position"
          className="flex h-[30rem] max-h-[70vh] min-h-0 w-full flex-col overflow-hidden rounded-lg border border-studio-border bg-studio-panel"
        />
      </div>
    </Dialog>
  );
}
