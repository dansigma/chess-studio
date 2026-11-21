"use client";

import { useMemo } from "react";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { getDueRepertoireMoves, repertoireMoves } from "@/src/chess/repertoire";
import { trainingColor } from "@/src/chess/training";
import { fenKey, getFenAt, getNodeAt } from "@/src/chess/tree";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Controls";

export function RepertoirePanel() {
  // SIG-857: shared active-board selector instead of the inline find.
  const board = useActiveBoard();
  const locale = useStudioStore((state) => state.settings.locale);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const goPath = useStudioStore((state) => state.goPath);
  const training = useStudioStore((state) => state.training);
  const trainingMiss = useStudioStore((state) => state.trainingMiss);
  const showTrainingHint = useStudioStore((state) => state.showTrainingHint);
  const drillDueOnly = useStudioStore((state) => state.drillDueOnly);
  const repertoireProgress = useStudioStore((state) => state.repertoireProgress);
  const startTraining = useStudioStore((state) => state.startTraining);
  const startDueDrill = useStudioStore((state) => state.startDueDrill);
  const stopTraining = useStudioStore((state) => state.stopTraining);
  const moves = repertoireMoves(board.tree, board.path);
  const fen = getFenAt(board.tree, board.path);
  const side = sideFromFen(fen);
  const miss = trainingMiss?.fenKey === fenKey(fen) ? trainingMiss : null;

  const color = trainingColor(board);
  const dueMoves = useMemo(
    () => getDueRepertoireMoves(board.tree, repertoireProgress, color),
    [board.tree, repertoireProgress, color]
  );
  const dueCount = dueMoves.length;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-caption uppercase tracking-wide text-studio-faint">{tPanels(locale, "repertoire.title")}</span>
          <Badge tone={dueCount > 0 ? "accent" : "neutral"}>
            {dueCount === 1
              ? tPanels(locale, "repertoire.due.one", { count: dueCount })
              : tPanels(locale, "repertoire.due.other", { count: dueCount })}
          </Badge>
        </div>
        <span className="flex gap-2">
          {training ? (
            <>
              {drillDueOnly ? (
                <Button variant="primary" size="sm" disabled={dueCount === 0} onClick={startDueDrill}>
                  {tPanels(locale, "repertoire.drillDue")}
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={startTraining}>
                  {tPanels(locale, "repertoire.trainAgain")}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={stopTraining}>
                {tPanels(locale, "repertoire.stop")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={startTraining}>
                {tPanels(locale, "repertoire.train")}
              </Button>
              <Button variant="primary" size="sm" disabled={dueCount === 0} onClick={startDueDrill}>
                {tPanels(locale, "repertoire.drillDue")}
              </Button>
            </>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {training ? (
          miss ? (
            <div className="flex items-center justify-between gap-2 p-3">
              <p role="status">{tRepertoire(locale, "repertoire.training.wrongMove")}</p>
              <Button variant="secondary" size="sm" onClick={showTrainingHint} disabled={miss.hint === 2}>
                {tRepertoire(locale, "repertoire.training.hint")}
              </Button>
            </div>
          ) : drillDueOnly ? (
            <div className="px-3 py-4 text-studio-muted">
              {tPanels(locale, "repertoire.drilling", { count: dueCount })}
            </div>
          ) : (
            <div className="p-3">
              <p
                role="status"
                data-testid="repertoire-training-card"
                className={`rounded-lg border border-studio-border bg-studio-elevated p-3 text-dense ${
                  moves.length === 0 ? "font-medium text-studio-fg" : "text-studio-muted"
                }`}
              >
                {tPanels(locale, moves.length === 0 ? "repertoire.lineComplete" : "repertoire.trainingActive")}
              </p>
            </div>
          )
        ) : moves.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">{tPanels(locale, "repertoire.empty")}</div>
        ) : (
          moves.map((move) => (
            <button
              key={move.uci}
              className="block w-full px-3 py-1.5 text-left font-medium hover:bg-studio-hover-subtle"
              onClick={() => {
                if (!getNodeAt(board.tree, move.path)) {
                  return;
                }
                goPath(move.path);
              }}
              type="button"
            >
              {formatSan(move.san, moveNotation, side)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
