"use client";

export type ResultWinner = "white" | "black" | "draw" | null;

export function ResultMark({ winner }: { winner: ResultWinner }) {
  if (winner === "white") {
    return <span className="text-studio-fg">1-0</span>;
  }
  if (winner === "black") {
    return <span className="text-studio-muted">0-1</span>;
  }
  return <span className="text-studio-faint">½-½</span>;
}
