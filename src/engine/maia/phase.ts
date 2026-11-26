const MATERIAL: Readonly<Record<string, number>> = { n: 3, b: 3, r: 5, q: 9 };

/** Non-pawn material for both sides, divided by the starting total. */
export function materialPhase(fen: string): number {
  const [placement] = fen.split(" ", 1);
  let material = 0;
  for (const piece of placement.toLowerCase()) {
    material += MATERIAL[piece] ?? 0;
  }
  return material / 62;
}
