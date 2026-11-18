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
  neutral = false,
  noEvalLabel,
}: {
  pawns: number;
  label: string;
  orientation: BoardOrientation;
  /** SIG-1209: during a Game Review retry the bar stays level and shows no number. */
  neutral?: boolean;
  /** SIG-1407: when neutral outside review retries (e.g. unfocused live board without [%eval]), show a muted/dashed bar with tooltip. */
  noEvalLabel?: string;
}) {
  const whitePercent = neutral ? 50 : evalBarPercent(pawns);
  const whiteAtBottom = orientation === "white";
  const whiteWinning = pawns >= 0;
  const mutedUnavailable = neutral && Boolean(noEvalLabel);

  return (
    <div
      aria-label={mutedUnavailable ? noEvalLabel : neutral ? undefined : `Evaluation ${label}`}
      aria-hidden={neutral && !mutedUnavailable ? true : undefined}
      title={mutedUnavailable ? noEvalLabel : neutral ? undefined : label}
      data-eval-unavailable={mutedUnavailable ? "" : undefined}
      className={`relative w-5 shrink-0 overflow-hidden rounded-md bg-studio-loss ${
        mutedUnavailable
          ? "border border-dashed border-studio-border-strong opacity-45"
          : "ring-1 ring-studio-border-strong"
      }`}
    >
      <div
        className="absolute left-0 right-0 bg-studio-win transition-[height] duration-300 ease-out"
        style={
          whiteAtBottom
            ? { bottom: 0, height: `${whitePercent}%` }
            : { top: 0, height: `${whitePercent}%` }
        }
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-studio-draw/60" aria-hidden="true" />
      {neutral ? null : (
        <span
          // SIG-1192: 9px was below the system's 10.5px legibility floor.
          className={`absolute inset-x-0 px-px text-center text-[10.5px] font-bold leading-tight tracking-tighter tabular-nums ${
            whiteWinning ? "text-studio-loss" : "text-studio-win"
          }`}
          style={whiteWinning === whiteAtBottom ? { bottom: 6 } : { top: 6 }}
        >
          {compactEvalLabel(label)}
        </span>
      )}
    </div>
  );
}
