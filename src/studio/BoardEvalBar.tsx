"use client";

import { evalBarPercent } from "@/src/engine/stockfish-client";
import type { BoardOrientation } from "@/src/store/studio-store";

function compactEvalLabel(label: string): string {
  if (label.includes("M")) {
    return label.replace(/^\+/, "");
  }
  const value = Number(label);
  if (Number.isNaN(value)) {
    return label.replace(/^\+/, "");
  }
  const abs = Math.abs(value);
  if (abs >= 10) {
    return abs.toFixed(0);
  }
  return abs.toFixed(1);
}

export function BoardEvalBar({
  pawns,
  label,
  orientation,
}: {
  pawns: number;
  label: string;
  orientation: BoardOrientation;
}) {
  const whitePercent = evalBarPercent(pawns);
  const whiteAtBottom = orientation === "white";
  const whiteWinning = pawns >= 0;

  return (
    <div
      aria-label={`Evaluation ${label}`}
      title={label}
      className="relative w-[18px] shrink-0 overflow-hidden rounded-md bg-zinc-950"
    >
      <div
        className="absolute left-0 right-0 bg-zinc-100 transition-[height] duration-200"
        style={
          whiteAtBottom
            ? { bottom: 0, height: `${whitePercent}%` }
            : { top: 0, height: `${whitePercent}%` }
        }
      />
      <span
        className={`absolute inset-x-0 px-px text-center text-[9px] font-bold leading-tight ${
          whiteWinning ? "text-zinc-900" : "text-zinc-100"
        }`}
        style={
          whiteWinning === whiteAtBottom ? { bottom: 6 } : { top: 6 }
        }
      >
        {compactEvalLabel(label)}
      </span>
    </div>
  );
}
