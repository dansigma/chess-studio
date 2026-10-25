"use client";

import { useActiveBoard } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import type { GameTree, Path } from "@/src/chess/tree";
import { ChevronLeft, ChevronRight } from "lucide-react";

// SIG-1043: mobile move strip shows the current line's mainline SANs in a
// horizontally scrollable row. Variations stay a desktop concern (SIG-1108).

export type MobileStripMove = {
  san: string;
  path: Path;
};

export type MobileStripModel = {
  moves: MobileStripMove[];
  currentIndex: number;
};

export function mobileStripModel(tree: GameTree, path: Path): MobileStripModel {
  const moves: MobileStripMove[] = [];
  let nodes = tree.children;
  let cursor: Path = [];
  // Walk the mainline (first-child spine), recording each ply's path.
  while (nodes[0]) {
    const node = nodes[0];
    cursor = [...cursor, 0];
    moves.push({ san: node.san, path: cursor });
    nodes = node.children;
  }
  // The live path may diverge into a variation — clamp to the longest
  // mainline prefix so the highlight never points past the strip.
  let currentIndex = -1;
  for (let i = 0; i < moves.length; i++) {
    if (i >= path.length || path[i] !== 0) {
      break;
    }
    currentIndex = i;
  }
  return { moves, currentIndex };
}

export function MobileMoveStrip() {
  const board = useActiveBoard();
  const back = useStudioStore((state) => state.back);
  const forward = useStudioStore((state) => state.forward);
  const goPath = useStudioStore((state) => state.goPath);
  const { moves, currentIndex } = mobileStripModel(board.tree, board.path);

  return (
    <div
      data-mobile-move-strip=""
      className="flex min-h-0 items-center gap-1 border-t border-studio-border-subtle bg-studio-panel px-2 py-1.5"
    >
      <button
        type="button"
        aria-label="Previous move"
        onClick={back}
        disabled={board.path.length === 0}
        className="shrink-0 rounded-md p-1.5 text-studio-fg hover:bg-studio-hover-strong disabled:opacity-40"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
        {moves.map((move, index) => {
          const active = index === currentIndex;
          return (
            <button
              key={move.path.join("-")}
              type="button"
              data-mobile-move={index}
              aria-current={active ? "step" : undefined}
              onClick={() => goPath(move.path)}
              className={`shrink-0 rounded-[5px] px-2 py-1 text-sm font-medium leading-5 ${
                active
                  ? "bg-studio-accent-move text-studio-accent-fg"
                  : "text-studio-fg hover:bg-studio-hover-strong"
              }`}
            >
              {move.san}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Next move"
        onClick={forward}
        disabled={currentIndex >= moves.length - 1}
        className="shrink-0 rounded-md p-1.5 text-studio-fg hover:bg-studio-hover-strong disabled:opacity-40"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
