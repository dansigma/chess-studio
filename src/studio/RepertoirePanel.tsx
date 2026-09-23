"use client";

import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { repertoireMoves } from "@/src/chess/repertoire";
import { getFenAt, getNodeAt } from "@/src/chess/tree";
import { useStudioStore } from "@/src/store/studio-store";

export function RepertoirePanel() {
  const board = useStudioStore((state) => {
    return state.boards.find((item) => item.id === state.activeBoardId) ?? state.boards[0];
  });
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const goPath = useStudioStore((state) => state.goPath);
  const moves = repertoireMoves(board.tree, board.path);
  const fen = getFenAt(board.tree, board.path);
  const side = sideFromFen(fen);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-[13px] text-studio-fg">
      <div className="border-b border-studio-border-subtle px-3 py-2 text-[11px] uppercase tracking-wide text-studio-faint">
        Repertoire
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {moves.length === 0 ? (
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
