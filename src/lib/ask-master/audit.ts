import { Chess, DEFAULT_POSITION } from "chess.js";
import { computePositionFacts, computeThreats, computeThreatsToMove } from "../../chess/facts/index";
import { fenPly, parseAnswer, type AnswerPosition } from "./answer-lines";

const claimTypes = ["attacks", "defends", "pins", "hanging", "threatens"] as const;
type Claim =
  | { type: "hanging"; piece: string; target?: never }
  | { type: Exclude<typeof claimTypes[number], "hanging">; piece: string; target: string };

function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== "object" || !("type" in value) || !("piece" in value)) return false;
  if (!claimTypes.some((type) => type === value.type) ||
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

export function stripFalse(body: string, { falseClaims, illegalLines }: ReturnType<typeof auditAnswer>): string {
  const lines = /\[\[([\s\S]*?)\]\]/g;
  const withoutIllegal = body.replace(lines, (line, raw: string) => illegalLines.includes(raw) ? "" : line);
  if (!falseClaims.length) return withoutIllegal.trim();

  // Keep sentence boundaries outside SAN, including periods in move numbers.
  const masked = withoutIllegal.replace(lines, (line) => " ".repeat(line.length));
  const mentions = (sentence: string, square: string) => new RegExp(`\\b[KQRBNP]?${square}\\b`, "i").test(sentence);
  return Array.from(masked.matchAll(/[^\n]+?(?:[.!?]+(?=\s|$)|(?=\n|$))|\n/g))
    .filter(({ 0: sentence }) => !falseClaims.some(({ claim }) =>
      mentions(sentence, claim.piece.slice(-2)) && (!claim.target || mentions(sentence, claim.target))))
    .map(({ 0: sentence, index }) => withoutIllegal.slice(index, index + sentence.length))
    .join("").trim();
}
