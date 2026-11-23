import { parseSetupFen } from "./setup-fen.ts";

const PIECES = [
  { piece: "Q", start: 1, points: 9 },
  { piece: "R", start: 2, points: 5 },
  { piece: "B", start: 2, points: 3 },
  { piece: "N", start: 2, points: 3 },
  { piece: "P", start: 8, points: 1 },
] as const;

export type MaterialColor = "w" | "b";
type CapturedGroup = { piece: (typeof PIECES)[number]["piece"]; count: number };

export function materialBalance(fen: string): {
  captured: Record<MaterialColor, CapturedGroup[]>;
  difference: number;
} {
  const counts = new Map<string, number>();
  for (const piece of Object.values(parseSetupFen(fen).pieces)) {
    counts.set(piece, (counts.get(piece) ?? 0) + 1);
  }

  const captured: Record<MaterialColor, CapturedGroup[]> = { w: [], b: [] };
  let difference = 0;
  for (const color of ["w", "b"] as const) {
    const opponent = color === "w" ? "b" : "w";
    let visiblePromotions = 0;
    for (const { piece, start, points } of PIECES) {
      const count = counts.get(`${color}${piece}`) ?? 0;
      difference += count * points * (color === "w" ? 1 : -1);

      // Extra non-pawns account for missing pawns. A FEN alone cannot identify
      // promotions when the promoted piece replaces an already missing piece.
      const missing = start - count;
      if (piece !== "P") {
        visiblePromotions += Math.max(0, -missing);
      }
      const captures = piece === "P" ? missing - visiblePromotions : missing;
      if (captures > 0) {
        captured[opponent].push({ piece, count: captures });
      }
    }
  }
  return { captured, difference };
}
