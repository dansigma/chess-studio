import { Chess, DEFAULT_POSITION } from "chess.js";
import { computePositionFacts, computeThreats, computeThreatsToMove } from "../../chess/facts/index";
import type { PawnKind } from "../../chess/facts/types";
import { fenPly, parseAnswer, type AnswerPosition } from "./answer-lines";

const claimTypes = ["attacks", "defends", "pins", "hanging", "threatens"] as const;
const pawnKinds = ["isolated", "doubled", "passed", "backward"] as const satisfies readonly PawnKind[];
const sideColors = { white: "w", black: "b" } as const;
type Side = keyof typeof sideColors;
type Claim =
  | { type: "hanging"; piece: string; target?: never }
  | { type: Exclude<typeof claimTypes[number], "hanging">; piece: string; target: string }
  | { type: "file"; file: string; state: "open" | "closed"; for?: never }
  | { type: "file"; file: string; state: "half-open"; for: Side }
  | { type: "pawn"; square: string; kind: PawnKind }
  | { type: "king"; side: Side; state: "castled" | "uncastled" }
  | { type: "break"; side: Side; move: string };

function isSquare(value: unknown): value is string {
  return typeof value === "string" && value.length === 2 && /^[a-h][1-8]$/.test(value);
}

function isSide(value: unknown): value is Side {
  return value === "white" || value === "black";
}

function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  switch (value.type) {
    case "file":
      return "file" in value && typeof value.file === "string" && value.file.length === 1 &&
        /^[a-h]$/.test(value.file) && "state" in value &&
        (value.state === "half-open" ? "for" in value && isSide(value.for)
          : (value.state === "open" || value.state === "closed") && !("for" in value));
    case "pawn":
      return "square" in value && isSquare(value.square) &&
        "kind" in value && pawnKinds.some((kind) => kind === value.kind);
    case "king":
      return "side" in value && isSide(value.side) && "state" in value &&
        (value.state === "castled" || value.state === "uncastled");
    case "break":
      return "side" in value && isSide(value.side) && "move" in value && isSquare(value.move);
  }
  if (!claimTypes.some((type) => type === value.type) || !("piece" in value) ||
      typeof value.piece !== "string" || !/^[KQRBNP]?[a-h][1-8]$/.test(value.piece)) return false;
  return value.type === "hanging"
    ? !("target" in value)
    : "target" in value && typeof value.target === "string" && /^[a-h][1-8]$/.test(value.target);
}

export function extractClaims(text: string): { body: string; claims: Claim[] } {
  const start = text.search(/<\/?claims\b/i);
  if (start === -1) return { body: text.trim(), claims: [] };
  const body = text.slice(0, start).trimEnd();
  const match = /^<claims>([\s\S]*?)<\/claims>\s*$/i.exec(text.slice(start));
  if (match) {
    try {
      const parsed: unknown = JSON.parse(match[1]);
      if (Array.isArray(parsed)) return { body, claims: parsed.every(isClaim) ? parsed : [] };
    } catch {
      // The metadata may have been truncated or contain invalid JSON.
    }
  }
  return { body, claims: [] };
}

export function replayAnswerPosition(fen: string, context: unknown): AnswerPosition {
  const current = { currentFen: fen, lineFens: [], lineStartPly: 0 };
  if (!context || typeof context !== "object" || !("moves" in context) || !Array.isArray(context.moves)) {
    return current;
  }
  if ("earlierMovesOmitted" in context && context.earlierMovesOmitted !== 0) return current;
  try {
    const startFen = "startFen" in context && typeof context.startFen === "string"
      ? context.startFen : DEFAULT_POSITION;
    const chess = new Chess(startFen);
    const lineFens = [chess.fen()];
    for (const san of context.moves) {
      if (typeof san !== "string") return current;
      const move = chess.move(san, { strict: true });
      if (move.from === move.to) return current;
      lineFens.push(chess.fen());
    }
    if (chess.fen() === new Chess(fen).fen()) {
      return { currentFen: fen, lineFens, lineStartPly: fenPly(lineFens[0]) };
    }
  } catch {
    // Only use earlier positions when the supplied moves can be verified.
  }
  return current;
}

function claimTruth(claim: Claim, position: AnswerPosition): string | undefined {
  const { currentFen } = position;
  const facts = computePositionFacts(currentFen);
  if (!facts.valid) return "The current position is unavailable.";
  switch (claim.type) {
    case "file": {
      const file = facts.files.find((fact) => fact.file === claim.file);
      const state = file?.openness ?? "closed";
      if (claim.state === state &&
          (claim.state !== "half-open" || file?.halfOpenFor === sideColors[claim.for])) return undefined;
      const pawns = facts.pieces.filter((piece) => piece.type === "p" && piece.square[0] === claim.file)
        .map((piece) => piece.square);
      const side = file?.halfOpenFor === "w" ? " for White" : file?.halfOpenFor === "b" ? " for Black" : "";
      const occupancy = pawns.length ? ` (pawns on ${pawns.join(" and ")})` : "";
      return `${claim.file}-file is ${state}${side}${occupancy}.`;
    }
    case "pawn": {
      if (!facts.pieces.some((piece) => piece.square === claim.square && piece.type === "p")) {
        return `There is no pawn on ${claim.square}.`;
      }
      const kinds = facts.pawns.filter((pawn) => pawn.square === claim.square).map((pawn) => pawn.kind);
      return kinds.includes(claim.kind) ? undefined
        : `Pawn traits on ${claim.square}: ${kinds.join(", ") || "none"}.`;
    }
    case "king": {
      const king = facts.kings.find((king) => king.color === sideColors[claim.side]);
      if (!king) return `The ${claim.side} king is unavailable.`;
      return king.castling === claim.state ? undefined
        : `The ${claim.side} king is ${king.castling} on ${king.square}.`;
    }
    case "break": {
      const targets = [...new Set(facts.breaks.filter((move) => move.side === sideColors[claim.side])
        .map((move) => move.to))];
      return targets.includes(claim.move) ? undefined
        : `Pawn break targets for ${claim.side}: ${targets.join(", ") || "none"}.`;
    }
  }
  const square = claim.piece.slice(-2);
  const piece = facts.pieces.find((candidate) => candidate.square === square);
  if (!piece) return `${square} is empty.`;
  const expectedType = claim.piece.length === 2 ? "p" : claim.piece[0].toLowerCase();
  if (piece.type !== expectedType) return `${square} contains a ${piece.color} ${piece.type}.`;

  const list = (squares: string[]) => squares.join(", ") || "none";
  switch (claim.type) {
    case "attacks":
      return piece.attacks.includes(claim.target) ? undefined : `Attacked squares: ${list(piece.attacks)}.`;
    case "defends":
      return piece.defends.includes(claim.target) ? undefined : `Defended pieces: ${list(piece.defends)}.`;
    case "pins": {
      const pinned = facts.pieces.filter((candidate) => candidate.pinned?.by === square).map((candidate) => candidate.square);
      return pinned.includes(claim.target) ? undefined : `Pinned pieces: ${list(pinned)}.`;
    }
    case "hanging":
      return piece.hanging ? undefined : `${claim.piece} is not hanging.`;
    case "threatens": {
      const threats = piece.color === facts.turn ? computeThreatsToMove(currentFen) : computeThreats(currentFen);
      const targets = [...new Set(threats.threats.filter((threat) => threat.from === square).flatMap((threat) => threat.targets))];
      return targets.includes(claim.target) ? undefined : `Threatened pieces: ${list(targets)}.`;
    }
  }
}

export function auditAnswer(body: string, claims: Claim[], position: AnswerPosition) {
  const falseClaims = claims.flatMap((claim) => {
    const truth = claimTruth(claim, position);
    return truth === undefined ? [] : [{ claim, truth }];
  });
  const illegalLines = parseAnswer(body, position).flatMap((segment) =>
    segment.type === "invalid-line" ? [segment.raw] : []);
  return { ok: falseClaims.length === 0 && illegalLines.length === 0, falseClaims, illegalLines };
}

const pawnTerms: Record<PawnKind, RegExp> = {
  isolated: /\b(?:isolated|isolad[oa]s?)\b/i,
  doubled: /\b(?:doubled|dobrad[oa]s?)\b/i,
  passed: /\b(?:passed|passad[oa]s?)\b/i,
  backward: /\b(?:backward|atrasad[oa]s?)\b/i,
};
const sideTerms: Record<Side, RegExp> = {
  white: /\b(?:white|branc[oa]s?)\b/i,
  black: /\b(?:black|pret[oa]s?)\b/i,
};

function mentionsSquare(sentence: string, square: string): boolean {
  return new RegExp(`\\b[KQRBNP]?${square}\\b`, "i").test(sentence);
}

function mentionsClaim(sentence: string, claim: Claim): boolean {
  const prose = sentence.normalize("NFD").replace(/\p{M}/gu, "");
  switch (claim.type) {
    case "file":
      return new RegExp(`\\b(?:${claim.file}-file|coluna (?:de )?${claim.file})\\b`, "i").test(prose) &&
        /\b(?:abertas?|semi[- ]?abertas?|fechadas?|open|half[- ]open|semi[- ]open|closed)\b/i.test(prose);
    case "pawn":
      return mentionsSquare(prose, claim.square) && pawnTerms[claim.kind].test(prose);
    case "king":
      return sideTerms[claim.side].test(prose) &&
        /\b(?:roc(?:ar(?:am)?|ou|ad[oa]s?|a|am)|roques?|castl(?:e[ds]?|ing)|uncastled)\b/i.test(prose);
    case "break":
      return mentionsSquare(prose, claim.move) && /\b(?:breaks?|rupturas?)\b/i.test(prose);
    default:
      return mentionsSquare(sentence, claim.piece.slice(-2)) &&
        (!claim.target || mentionsSquare(sentence, claim.target));
  }
}

export function stripFalse(body: string, { falseClaims, illegalLines }: ReturnType<typeof auditAnswer>): string {
  const lines = /\[\[([\s\S]*?)\]\]/g;
  const withoutIllegal = body.replace(lines, (line, raw: string) => illegalLines.includes(raw) ? "" : line);
  if (!falseClaims.length) return withoutIllegal.trim();

  // Keep sentence boundaries outside SAN, including periods in move numbers.
  const masked = withoutIllegal.replace(lines, (line) => " ".repeat(line.length));
  return Array.from(masked.matchAll(/[^\n]+?(?:[.!?]+(?=\s|$)|(?=\n|$))|\n/g))
    .filter(({ 0: sentence }) => !falseClaims.some(({ claim }) => mentionsClaim(sentence, claim)))
    .map(({ 0: sentence, index }) => withoutIllegal.slice(index, index + sentence.length))
    .join("").trim();
}
