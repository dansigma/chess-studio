"use client";

export type ResultWinner = "white" | "black" | "draw" | null;

/** Single source for PGN `Result` header → winner mapping (`1-0/0-1/1/2-1/2`, else null). */
export function pgnResultToWinner(result: string | undefined): ResultWinner {
  if (result === "1-0") {
    return "white";
  }
  if (result === "0-1") {
    return "black";
  }
  if (result === "1/2-1/2") {
    return "draw";
  }
  return null;
}

/** Single source for winner → caption text (mark + label shown in the notation footer). */
export function resultCaptionForWinner(winner: ResultWinner): { mark: string; label: string } | null {
  if (winner === "white") {
    return { mark: "1-0", label: "White wins" };
  }
  if (winner === "black") {
    return { mark: "0-1", label: "Black wins" };
  }
  if (winner === "draw") {
    return { mark: "½-½", label: "Draw" };
  }
  return null;
}

/** Canonical PGN result caption: winner plus its display mark/label (null when no result). */
export function pgnResultCaption(result: string | undefined): {
  winner: ResultWinner;
  mark: string;
  label: string;
} | null {
  const winner = pgnResultToWinner(result);
  const caption = resultCaptionForWinner(winner);
  return caption ? { winner, ...caption } : null;
}

export function ResultMark({ winner }: { winner: ResultWinner }) {
  if (winner === "white") {
    return <span className="text-studio-fg">1-0</span>;
  }
  if (winner === "black") {
    return <span className="text-studio-muted">0-1</span>;
  }
  return <span className="text-studio-faint">½-½</span>;
}
