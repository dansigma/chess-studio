"use client";

import { forwardRef, type ReactNode } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

// SIG-952: shared chessboard glyph for the Board surfaces (Board tab,
// activity-rail "Open boards" button). lucide-react 1.47.0 has no board /
// checkerboard icon, so this draws a 4x4 checker (integer 5px cells stay
// legible at the 13px tab size) inside the lucide-style rounded square.
// Typed as LucideIcon so it drops into the existing icon slots untouched.
export const ChessboardIcon: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(
  function ChessboardIcon({ size = 24, strokeWidth = 2, ...props }, ref) {
    const cells: ReactNode[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 2 === 1) {
          cells.push(
            <rect
              key={`${row}-${col}`}
              x={2 + col * 5}
              y={2 + row * 5}
              width={5}
              height={5}
              fill="currentColor"
              stroke="none"
            />,
          );
        }
      }
    }
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
      >
        <rect x={2} y={2} width={20} height={20} rx={2} />
        {cells}
      </svg>
    );
  },
);
