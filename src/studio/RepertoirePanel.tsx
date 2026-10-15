"use client";

import { useMemo } from "react";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { getDueRepertoireMoves, repertoireMoves } from "@/src/chess/repertoire";
import { getFenAt, getNodeAt } from "@/src/chess/tree";
import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";

export function RepertoirePanel() {
  // SIG-857: shared active-board selector instead of the inline find.
  const board = useActiveBoard();
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const goPath = useStudioStore((state) => state.goPath);
  const training = useStudioStore((state) => state.training);
  const drillDueOnly = useStudioStore((state) => state.drillDueOnly);
  const repertoireProgress = useStudioStore((state) => state.repertoireProgress);
  const startTraining = useStudioStore((state) => state.startTraining);
  const startDueDrill = useStudioStore((state) => state.startDueDrill);
  const stopTraining = useStudioStore((state) => state.stopTraining);
  const moves = repertoireMoves(board.tree, board.path);
  const fen = getFenAt(board.tree, board.path);
  const side = sideFromFen(fen);

  const dueMoves = useMemo(
    () => getDueRepertoireMoves(board.tree, repertoireProgress),
    [board.tree, repertoireProgress]
  );
  const dueCount = dueMoves.length;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-caption uppercase tracking-wide text-studio-faint">Repertoire</span>
          <span className="rounded bg-studio-surface-raised px-1.5 py-0.5 text-dense font-mono text-studio-accent">
            {dueCount} Due
          </span>
        </div>
        <span className="flex gap-2">
          {training ? (
            <>
              {drillDueOnly ? (
                <button
                  type="button"
                  className="rounded bg-studio-accent px-2 py-1 text-dense text-studio-accent-fg hover:bg-studio-accent-strong"
                  onClick={startDueDrill}
                >
                  Drill Due
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded bg-studio-accent px-2 py-1 text-dense text-studio-accent-fg hover:bg-studio-accent-strong"
                  onClick={startTraining}
                >
                  Train again
                </button>
              )}
              <button
                type="button"
                className="rounded px-2 py-1 text-dense text-studio-muted hover:text-studio-fg"
                onClick={stopTraining}
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded bg-studio-hover-strong px-2 py-1 text-dense text-studio-fg hover:bg-studio-selected"
                onClick={startTraining}
              >
                Train
              </button>
              <button
                type="button"
                disabled={dueCount === 0}
                className="rounded bg-studio-accent px-2 py-1 text-dense text-studio-accent-fg hover:bg-studio-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
                onClick={startDueDrill}
              >
                Drill Due
              </button>
            </>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {training ? (
          drillDueOnly ? (
            <div className="px-3 py-4 text-studio-muted">
              Drilling due moves ({dueCount} remaining)
            </div>
          ) : null
        ) : moves.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">No moves stored here.</div>
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
