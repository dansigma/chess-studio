import { Chess } from "chess.js";

export type AnswerPosition = {
  currentFen: string;
  lineFens: readonly string[];
  lineStartPly: number;
};

export type AnswerLine = {
  type: "line";
  raw: string;
  startFen: string;
  startPly: number;
  moves: { san: string; uci: string }[];
};

type AnswerSegment = AnswerLine | { type: "text"; text: string } | { type: "invalid-line"; raw: string };
type GameCitation = { type: "game"; id: string };

export function fenPly(fen: string): number {
  const fields = fen.split(/\s+/);
  return (Number(fields[5]) - 1) * 2 + (fields[1] === "b" ? 1 : 0);
}

function parseLine(raw: string, { currentFen, lineFens, lineStartPly }: AnswerPosition): AnswerSegment {
  const invalid = { type: "invalid-line", raw } as const;
  // Models often write "5…e6" with the Unicode ellipsis; read it as "5...e6".
  const source = raw.trim().replace(/\u2026/g, "...");
  const token = /\s*(?:(\d+)(\.{3}|\.)\s*)?(\S+)/gy;
  const first = token.exec(source);
  if (!first?.[1]) return invalid;

  const startPly = (Number(first[1]) - 1) * 2 + (first[2] === "..." ? 1 : 0);
  const currentPly = fenPly(currentFen);
  if (!Number.isSafeInteger(startPly) || startPly < 0 || startPly > currentPly) return invalid;
  const startFen = startPly === currentPly ? currentFen : lineFens[startPly - lineStartPly];
  if (!startFen || fenPly(startFen) !== startPly) return invalid;

  try {
    const chess = new Chess(startFen);
    const moves: AnswerLine["moves"] = [];
    for (let match = first; ; ) {
      const [, number, dots, san] = match;
      if (number && (Number(number) - 1) * 2 + (dots === "..." ? 1 : 0) !== startPly + moves.length) {
        return invalid;
      }
      const move = chess.move(san.replace(/^0-0(?:-0)?/, (castle) => castle.replaceAll("0", "O")), { strict: true });
      if (move.from === move.to) return invalid;
      moves.push({ san: move.san, uci: move.lan });
      if (token.lastIndex === source.length) break;
      const next = token.exec(source);
      if (!next) return invalid;
      match = next;
    }
    return { type: "line", raw, startFen, startPly, moves };
  } catch {
    return invalid;
  }
}

function parseLines(text: string, position: AnswerPosition): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
    if (match.index > cursor) segments.push({ type: "text", text: text.slice(cursor, match.index) });
    segments.push(parseLine(match[1], position));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
  return segments;
}

function parseGameCitations(text: string): (AnswerSegment | GameCitation)[] {
  const segments: (AnswerSegment | GameCitation)[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\{\{game:([^{}\r\n]*)\}\}/g)) {
    if (match.index > cursor) segments.push({ type: "text", text: text.slice(cursor, match.index) });
    segments.push({ type: "game", id: match[1].trim() });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
  return segments;
}

export function parseAnswer(text: string, position: AnswerPosition): (AnswerSegment | GameCitation)[] {
  return parseLines(text, position).flatMap((segment) =>
    segment.type === "text" ? parseGameCitations(segment.text) : [segment],
  );
}
