export const MOVE_NOTATION_IDS = [
  "english",
  "unicode",
  "german",
  "spanish",
  "portuguese",
  "russian",
] as const;

export type MoveNotation = (typeof MOVE_NOTATION_IDS)[number];

export const MOVE_NOTATIONS: Record<MoveNotation, { label: string }> = {
  english: { label: "English" },
  unicode: { label: "Unicode" },
  german: { label: "German" },
  spanish: { label: "Spanish" },
  portuguese: { label: "Portuguese" },
  russian: { label: "Russian" },
};

const LETTER_MAP: Record<Exclude<MoveNotation, "unicode">, Record<string, string>> = {
  english: { K: "K", Q: "Q", R: "R", B: "B", N: "N" },
  german: { K: "K", Q: "D", R: "T", B: "L", N: "S" },
  spanish: { K: "R", Q: "D", R: "T", B: "A", N: "C" },
  portuguese: { K: "R", Q: "D", R: "T", B: "B", N: "C" },
  russian: { K: "Кр", Q: "Ф", R: "Л", B: "С", N: "К" },
};

const UNICODE_WHITE: Record<string, string> = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
};

const UNICODE_BLACK: Record<string, string> = {
  K: "♚",
  Q: "♛",
  R: "♜",
  B: "♝",
  N: "♞",
};

export function isMoveNotation(value: unknown): value is MoveNotation {
  return typeof value === "string" && value in MOVE_NOTATIONS;
}

export function sideFromFen(fen: string): "w" | "b" {
  return fen.trim().split(/\s+/)[1] === "b" ? "b" : "w";
}

function lettersFor(style: MoveNotation, color: "w" | "b"): Record<string, string> {
  if (style === "unicode") {
    return color === "b" ? UNICODE_BLACK : UNICODE_WHITE;
  }
  return LETTER_MAP[style];
}

export function formatSan(san: string, style: MoveNotation, color: "w" | "b" = "w"): string {
  if (style === "english") {
    return san;
  }
  if (san.startsWith("O-O") || san === "--" || san === "Z0") {
    return san;
  }
  const letters = lettersFor(style, color);
  const withPromotion = san.replace(/=([NBRQ])/g, (_match, piece: string) => `=${letters[piece] ?? piece}`);
  const first = withPromotion[0];
  if (first && first in letters) {
    return `${letters[first]}${withPromotion.slice(1)}`;
  }
  return withPromotion;
}

export function formatSanAtPly(
  san: string,
  style: MoveNotation,
  startColor: "w" | "b",
  plyIndex: number,
): string {
  const color = plyIndex % 2 === 0 ? startColor : startColor === "w" ? "b" : "w";
  return formatSan(san, style, color);
}
