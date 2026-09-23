let visibleFen: string | null = null;

export function publishVisibleFen(fen: string | null): void {
  visibleFen = fen;
}

export function fenToCopy(fallback: string): string {
  const fen = (visibleFen ?? fallback).trim();
  if (!fen) {
    throw new Error("No position to copy");
  }
  return fen;
}

export function boardImageElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const element = document.querySelector("[data-board-image]");
  return element instanceof HTMLElement ? element : null;
}
