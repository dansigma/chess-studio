"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { getFenAt } from "@/src/chess/tree";
import { buildSetupFen, parseSetupFen, setupFenError } from "@/src/chess/setup-fen";
import { publishVisibleFen } from "@/src/chess/copy-board";
import { Button, IconButton } from "./ui/Button";
import { PositionEditor } from "./PositionEditor";

export function SetupBoardPanel() {
  const board = useActiveBoard();
  const settings = useStudioStore((state) => state.settings);
  const locale = settings.locale;
  const applySetupFen = useStudioStore((state) => state.applySetupFen);
  const setSetupMode = useStudioStore((state) => state.setSetupMode);
  const sourceFen = getFenAt(board.tree, board.path);
  const [fen, setFen] = useState(() => buildSetupFen(parseSetupFen(sourceFen)));
  const error = setupFenError(fen);

  useEffect(() => {
    publishVisibleFen(fen);
    return () => publishVisibleFen(null);
  }, [fen]);

  return (
    <PositionEditor
      value={fen}
      onChange={setFen}
      error={error ? error.replace(/^Error:\s*/, "") : null}
      locale={locale}
      orientation={board.orientation}
      boardTheme={settings.boardTheme}
      pieceSet={settings.pieceSet}
      showCoordinates={settings.showCoordinates}
      boardId={`setup-${board.id}`}
      toolbarStart={
        <Button size="sm" variant="primary" disabled={Boolean(error)} onClick={() => applySetupFen(fen)}>
          {tPanels(locale, "panels.setup.apply")}
        </Button>
      }
      toolbarEnd={
        <IconButton label={tPanels(locale, "panels.setup.close")} className="ml-auto" onClick={() => setSetupMode(false)}>
          <X size={15} />
        </IconButton>
      }
    />
  );
}
