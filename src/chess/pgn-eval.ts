// SIG-1312: `[%eval]` from a PGN move comment. Lichess writes it from White's point of view, in pawns
// (`[%eval 0.18]`) or as a mate distance (`[%eval #3]`, `[%eval #-2]`).

/** A PGN eval, White's point of view. Exactly one of `pawns` / `mate` is set. */
export type PgnEval = { pawns: number; mate?: undefined } | { mate: number; pawns?: undefined };

/** Parse the `eval` of a comment diagram (the parser gives a number for pawns, `"#n"` for mate). */
export function parsePgnEval(raw: unknown): PgnEval | undefined {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { pawns: raw } : undefined;
  }
  if (typeof raw !== "string") {
    return undefined;
  }
  const text = raw.trim();
  const mate = /^#([+-]?\d+)$/u.exec(text);
  if (mate) {
    const n = Number(mate[1]);
    return n !== 0 ? { mate: n } : undefined;
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/u.test(text)) {
    return undefined;
  }
  return { pawns: Number(text) };
}

/** The eval stored on a tree node (`evalPawns` / `evalMate`), or undefined when the PGN had none. */
export function nodeEval(node: { evalPawns?: number; evalMate?: number } | null | undefined): PgnEval | undefined {
  if (!node) {
    return undefined;
  }
  if (node.evalMate !== undefined) {
    return { mate: node.evalMate };
  }
  if (node.evalPawns !== undefined) {
    return { pawns: node.evalPawns };
  }
  return undefined;
}

/**
 * Bar value and label of a PGN eval, in the same format as the engine's `formatScore` / `scoreNumber`
 * (`+0.18`, `-1.20`, `M3`, `-M2`), so the eval bar treats both sources alike.
 */
export function pgnEvalDisplay(value: PgnEval): { pawns: number; label: string } {
  if (value.mate !== undefined) {
    const magnitude = 10000 - Math.abs(value.mate) * 10;
    return value.mate > 0
      ? { pawns: magnitude, label: `M${value.mate}` }
      : { pawns: -magnitude, label: `-M${Math.abs(value.mate)}` };
  }
  const pawns = value.pawns;
  const abs = Math.abs(pawns).toFixed(2);
  return { pawns, label: pawns >= 0 ? `+${abs}` : `-${abs}` };
}
