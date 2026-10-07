export type NagGroup = "move" | "position" | "other";

export type NagGlyph = {
  nag: number;
  glyph: string;
  label: string;
  group: NagGroup;
};

export const NAG_GLYPHS: NagGlyph[] = [
  { nag: 3, glyph: "!!", label: "Brilliant move", group: "move" },
  { nag: 1, glyph: "!", label: "Good move", group: "move" },
  { nag: 5, glyph: "!?", label: "Interesting move", group: "move" },
  { nag: 6, glyph: "?!", label: "Dubious move", group: "move" },
  { nag: 2, glyph: "?", label: "Mistake", group: "move" },
  { nag: 4, glyph: "??", label: "Blunder", group: "move" },
  { nag: 10, glyph: "=", label: "Equal", group: "position" },
  { nag: 13, glyph: "∞", label: "Unclear", group: "position" },
  { nag: 14, glyph: "⩲", label: "White slightly better", group: "position" },
  { nag: 15, glyph: "⩱", label: "Black slightly better", group: "position" },
  { nag: 16, glyph: "±", label: "White better", group: "position" },
  { nag: 17, glyph: "∓", label: "Black better", group: "position" },
  { nag: 18, glyph: "+−", label: "White winning", group: "position" },
  { nag: 19, glyph: "−+", label: "Black winning", group: "position" },
  { nag: 7, glyph: "□", label: "Only move", group: "other" },
  { nag: 22, glyph: "⨀", label: "Zugzwang", group: "other" },
  { nag: 32, glyph: "⟳", label: "Development", group: "other" },
  { nag: 36, glyph: "↑", label: "Initiative", group: "other" },
  { nag: 40, glyph: "→", label: "Attack", group: "other" },
  { nag: 132, glyph: "△", label: "With the idea", group: "other" },
  { nag: 146, glyph: "N", label: "Novelty", group: "other" },
];

const BY_NAG = new Map(NAG_GLYPHS.map((item) => [item.nag, item]));
const MOVE_NAGS = new Set(NAG_GLYPHS.filter((item) => item.group === "move").map((item) => item.nag));
const POSITION_NAGS = new Set(
  NAG_GLYPHS.filter((item) => item.group === "position").map((item) => item.nag),
);

export function nagGlyph(nag: number): NagGlyph | undefined {
  return BY_NAG.get(nag);
}

export function parseNags(raw: string[] | null | undefined): number[] | undefined {
  if (!raw || raw.length === 0) {
    return undefined;
  }
  const seen = new Set<number>();
  const nags: number[] = [];
  for (const token of raw) {
    const match = token.trim().match(/^\$?(\d+)$/);
    if (!match?.[1]) {
      continue;
    }
    const nag = Number(match[1]);
    if (!Number.isInteger(nag) || nag <= 0 || seen.has(nag)) {
      continue;
    }
    seen.add(nag);
    nags.push(nag);
  }
  return nags.length > 0 ? nags : undefined;
}

export function toggleNag(nags: number[] | undefined, nag: number): number[] | undefined {
  const current = nags ?? [];
  const selected = current.includes(nag);
  const exclusive =
    MOVE_NAGS.has(nag) ? MOVE_NAGS : POSITION_NAGS.has(nag) ? POSITION_NAGS : null;
  let next = exclusive ? current.filter((item) => !exclusive.has(item)) : [...current];
  if (!selected) {
    next.push(nag);
  }
  next = [...new Set(next)].sort((a, b) => a - b);
  return next.length > 0 ? next : undefined;
}

export function formatMoveSuffix(nags: number[] | undefined): string {
  const move = (nags ?? []).find((nag) => MOVE_NAGS.has(nag));
  return move ? (BY_NAG.get(move)?.glyph ?? "") : "";
}

export function formatPositionGlyphs(nags: number[] | undefined): string {
  return (nags ?? [])
    .filter((nag) => !MOVE_NAGS.has(nag))
    .map((nag) => BY_NAG.get(nag)?.glyph ?? `$${nag}`)
    .join(" ");
}

export function formatPgnNagTokens(nags: number[] | undefined): string {
  return (nags ?? []).map((nag) => `$${nag}`).join(" ");
}
