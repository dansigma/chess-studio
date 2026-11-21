"use client";

import { useMemo, useState } from "react";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { tRepertoire } from "@/src/i18n/repertoire-strings";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { getDueRepertoireMoves, repertoireMoves } from "@/src/chess/repertoire";
import { trainingColor } from "@/src/chess/training";
import { fenKey, getFenAt, getNodeAt } from "@/src/chess/tree";
import { useActiveBoard } from "@/src/store/hooks";
import { selectRepertoireBoard } from "@/src/store/slices/selectors";
import type { BoardOrientation } from "@/src/store/slices/types";
import { useStudioStore } from "@/src/store/studio-store";
import { AddVariationDialog } from "./repertoire/AddVariationDialog";
import { Button } from "./ui/Button";
import { Badge, Segmented } from "./ui/Controls";

export function RepertoirePanel() {
  // SIG-857: shared active-board selector instead of the inline find.
  const board = useActiveBoard();
  const [addingVariation, setAddingVariation] = useState(false);
  const whiteBoard = useStudioStore((state) => selectRepertoireBoard(state, "white"));
  const blackBoard = useStudioStore((state) => selectRepertoireBoard(state, "black"));
  const [missingSelection, setMissingSelection] = useState<{
    boardId: string;
    color: BoardOrientation;
  } | null>(null);
  const locale = useStudioStore((state) => state.settings.locale);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const goPath = useStudioStore((state) => state.goPath);
  const training = useStudioStore((state) => state.training);
  const trainingMiss = useStudioStore((state) => state.trainingMiss);
  const showTrainingHint = useStudioStore((state) => state.showTrainingHint);
  const drillDueOnly = useStudioStore((state) => state.drillDueOnly);
  const dueDrill = useStudioStore((state) => state.dueDrill);
  const skipDueReplay = useStudioStore((state) => state.skipDueReplay);
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
  const whiteTree = whiteBoard?.tree;
  const blackTree = blackBoard?.tree;
  const whiteDue = useMemo(
    () => whiteTree ? getDueRepertoireMoves(whiteTree, repertoireProgress, "w").length : 0,
    [whiteTree, repertoireProgress],
  );
  const blackDue = useMemo(
    () => blackTree ? getDueRepertoireMoves(blackTree, repertoireProgress, "b").length : 0,
    [blackTree, repertoireProgress],
  );
  const missingColor = missingSelection?.boardId === board.id &&
    !(missingSelection.color === "white" ? whiteBoard : blackBoard)
    ? missingSelection.color
    : null;

  function openRepertoire(color: BoardOrientation) {
    const target = color === "white" ? whiteBoard : blackBoard;
    setMissingSelection(target ? null : { boardId: board.id, color });
    if (target && target.id !== board.id) {
      useStudioStore.getState().setActiveBoard(target.id);
    }
  }

  function markRepertoire(color: BoardOrientation) {
    const store = useStudioStore.getState();
    store.stopTraining();
    store.setBoardRepertoire(board.id, color);
    setMissingSelection(null);
  }

  function createRepertoire(color: BoardOrientation) {
    const store = useStudioStore.getState();
    store.stopTraining();
    store.newBoard();
    const { activeBoardId } = useStudioStore.getState();
    store.setBoardRepertoire(activeBoardId, color);
    store.renameBoard(activeBoardId, tPanels(locale, `repertoire.boardTitle.${color}`));
    setMissingSelection(null);
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-caption uppercase tracking-wide text-studio-faint">{tPanels(locale, "repertoire.title")}</span>
          <Badge tone={dueCount > 0 ? "accent" : "neutral"}>
            {dueCount === 1
              ? tPanels(locale, "repertoire.due.one", { count: dueCount })
              : tPanels(locale, "repertoire.due.other", { count: dueCount })}
          </Badge>
        </div>
        <Segmented<BoardOrientation>
          compact
          ariaLabel={tPanels(locale, "repertoire.colorSwitch")}
          value={board.repertoireColor ?? null}
          options={[
            { value: "white", label: `${tPanels(locale, "repertoire.color.white")} ${whiteDue}` },
            { value: "black", label: `${tPanels(locale, "repertoire.color.black")} ${blackDue}` },
          ]}
          onChange={openRepertoire}
        />
        <Button variant="secondary" size="sm" onClick={() => setAddingVariation(true)}>
          {tRepertoire(locale, "variation.title")}
        </Button>
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
      {addingVariation && (
        <AddVariationDialog defaultColor={board.repertoireColor ?? "white"} onClose={() => setAddingVariation(false)} />
      )}
      {(!board.repertoireColor || missingColor) && (
        <div className="space-y-2 border-b border-studio-border-subtle px-3 py-2 text-dense text-studio-muted">
          {!board.repertoireColor && <p>{tPanels(locale, "repertoire.unmarked")}</p>}
          {missingColor && (
            <>
              <p aria-live="polite">{tPanels(locale, `repertoire.missing.${missingColor}`)}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => markRepertoire(missingColor)}>
                  {tPanels(locale, "repertoire.markBoard")}
                </Button>
                <Button variant="primary" size="sm" onClick={() => createRepertoire(missingColor)}>
                  {tPanels(locale, "repertoire.createBoard")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {training && drillDueOnly && dueDrill && (
          <div className="flex items-center justify-between gap-2 px-3 py-4 text-studio-muted">
            <p role={miss ? undefined : "status"}>
              {tPanels(locale, "repertoire.drilling", {
                current: dueDrill.total - dueDrill.queue.length + 1,
                total: dueDrill.total,
              })}
            </p>
            {dueDrill.replaying && (
              <Button variant="secondary" size="sm" onClick={skipDueReplay}>
                {tPanels(locale, "repertoire.skipAnimation")}
              </Button>
            )}
          </div>
        )}
        {training ? (
          miss ? (
            <div className="flex items-center justify-between gap-2 p-3">
              <p role="status">
                {tRepertoire(locale, miss.alternate
                  ? "repertoire.training.tryReviewMove"
                  : "repertoire.training.wrongMove")}
              </p>
              <Button variant="secondary" size="sm" onClick={showTrainingHint} disabled={miss.hint === 2}>
                {tRepertoire(locale, "repertoire.training.hint")}
              </Button>
            </div>
          ) : drillDueOnly ? null : (
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
