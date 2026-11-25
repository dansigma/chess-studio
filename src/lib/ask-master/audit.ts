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
  | { type: "break"; side: Side; move: string }
  /** Found in the prose by the server, never requested from the model. */
  | { type: "on"; piece: PieceLetter; square: string };
type PieceLetter = "K" | "Q" | "R" | "B" | "N" | "P";

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
    case "on": {
      const found = facts.pieces.find((piece) => piece.square === claim.square);
      if (found?.type === claim.piece.toLowerCase()) return undefined;
      return found ? `${claim.square} holds a ${found.color === "w" ? "White" : "Black"} ${pieceNames[found.type]}, not a ${pieceNames[claim.piece.toLowerCase()]}.`
        : `${claim.square} is empty.`;
    }
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

const pieceNames: Record<string, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const pieceWords: [RegExp, PieceLetter][] = [
  [/^(?:rei|king)$/i, "K"], [/^(?:dama|rainha|queen)$/i, "Q"], [/^(?:torre|rook)$/i, "R"],
  [/^(?:bispo|bishop)$/i, "B"], [/^(?:cavalo|knight)$/i, "N"], [/^(?:peao|pawn)$/i, "P"],
];
// "a torre de g1", "o rei preto em g8", "the rook on g1", "o peão branco de c4"
// Only definite references ("o cavalo de d3", "the rook on g1"); "um cavalo em e5" is hypothetical.
const PIECE_ON = /\b(?:o|a|os|as|do|da|no|na|pelo|pela|ao|seu|sua|the|its|his)\s+(rei|dama|rainha|torre|bispo|cavalo|peao|king|queen|rook|bishop|knight|pawn)(?:\s+(?:branc[oa]|pret[oa]|negr[oa]|white|black))?\s+(?:de|em|da|do|na|no|on|at)\s+([a-h][1-8])\b/gi;
// "a coluna f está meio-aberta", "as colunas g e h estão semiabertas para as pretas", "the f-file is open"
const FILE_PT = /\bcolunas?\s+((?:[a-h](?:\s*,\s*|\s+e\s+))*[a-h])\b[^.;:\n]{0,60}?\b(meio[- ]abertas?|semi[- ]?abertas?|abertas?|fechadas?)\b(?:\s+para\s+as\s+(brancas|pretas|negras))?/gi;
const FILE_EN = /\b((?:[a-h]-?(?:\s*,\s*|\s+and\s+))*[a-h])-files?\s+(?:is|are)\s+(?:now\s+)?(half[- ]open|semi[- ]open|open|closed)\b(?:\s+for\s+(white|black))?/gi;
// "the pawn on e4 is hanging to the knight on c6", "o peão de e4 está atacado pelo cavalo de f6":
// the attacker named after the verb must attack the last square named before it.
const ATTACKED_BY = /\b(?:hanging|loose|en prise|attacked|threatened|vulnerable|pendurad[oa]s?|solt[oa]s?|atacad[oa]s?|ameacad[oa]s?|vulnerave(?:l|is))\s+(?:to|by|a|ao|para|pelo|pela|por)\s+(?:(?:the|o|a)\s+)?(?:(?:white|black)\s+)?(rei|dama|rainha|torre|bispo|cavalo|peao|king|queen|rook|bishop|knight|pawn)(?:\s+(?:branc|pret|negr)[oa]s?)?\s+(?:on|at|from|de|em|da|do|na|no)\s+([a-h][1-8])\b/gi;
// "the knight on f6 attacks the pawn on e4", "o cavalo de f6 ataca o peão de e4"
const ATTACKS = /\b(?:the|o|a)\s+(rei|dama|rainha|torre|bispo|cavalo|peao|king|queen|rook|bishop|knight|pawn)(?:\s+(?:branc|pret|negr)[oa]s?)?\s+(?:on|at|de|em|da|do|na|no)\s+([a-h][1-8])\s+(?:attacks|threatens|ataca|ameaca)\s+(?:(?:the|o|a|os|as)\s+)?(?:(?:[a-z]+\s+){0,3}?(?:on|at|de|em|da|do|na|no)\s+)?([a-h][1-8])\b/gi;
// A sentence about a future position (after a line or a move sequence) may mention other squares.
const FUTURE = /\[\[|\b\d+\.{1,3}\s*[KQRBN]?[a-h]?x?[a-h][1-8]|\b(?:apos|depois|seguido|em seguida|entao|after|then|followed)\b/i;

function pieceLetter(word: string): PieceLetter | undefined {
  return pieceWords.find(([pattern]) => pattern.test(word))?.[1];
}

function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

function sentencesOf(body: string): string[] {
  const masked = body.replace(/\[\[([\s\S]*?)\]\]/g, (line) => line.replace(/[.!?]/g, " "));
  return Array.from(masked.matchAll(/[^\n]+?(?:[.!?]+(?=\s|$)|(?=\n|$))/g), ({ 0: sentence, index }) =>
    body.slice(index, index + sentence.length));
}

/** Claims the server reads from the prose itself: pieces on squares and file openness. */
export function proseClaims(body: string, position: AnswerPosition): Claim[] {
  const facts = computePositionFacts(position.currentFen);
  if (!facts.valid) return [];
  const claims: Claim[] = [];
  for (const sentence of sentencesOf(fold(body))) {
    if (!FUTURE.test(sentence)) {
      for (const [, word, square] of sentence.matchAll(PIECE_ON)) {
        const piece = pieceLetter(word);
        if (piece) claims.push({ type: "on", piece, square: square.toLowerCase() });
      }
      for (const match of sentence.matchAll(ATTACKED_BY)) {
        const target = Array.from(sentence.slice(0, match.index).matchAll(/\b([a-h][1-8])\b/gi)).at(-1)?.[1];
        const piece = pieceLetter(match[1]);
        if (target && piece) claims.push({ type: "attacks", piece: `${piece === "P" ? "" : piece}${match[2].toLowerCase()}`, target: target.toLowerCase() });
      }
      for (const [, word, square, target] of sentence.matchAll(ATTACKS)) {
        const piece = pieceLetter(word);
        if (piece) claims.push({ type: "attacks", piece: `${piece === "P" ? "" : piece}${square.toLowerCase()}`, target: target.toLowerCase() });
      }
    }
    for (const match of [...sentence.matchAll(FILE_PT), ...sentence.matchAll(FILE_EN)]) {
      const state = /^(?:meio|semi|half)/i.test(match[2]) ? "half-open" : /^(?:aberta|open)/i.test(match[2]) ? "open" : "closed";
      const side: Side | undefined = match[3] ? (/^(?:brancas|white)$/i.test(match[3]) ? "white" : "black") : undefined;
      for (const file of match[1].toLowerCase().split(/\s*,\s*|\s+(?:e|and)\s+/).map((name) => name.replace("-", ""))) {
        if (state !== "half-open") {
          claims.push({ type: "file", file, state });
          continue;
        }
        const actual = facts.files.find((fact) => fact.file === file);
        const actualSide = actual?.halfOpenFor === "w" ? "white" : actual?.halfOpenFor === "b" ? "black" : undefined;
        // Without a named side, take the real side when the file is half-open, so only the
        // openness is checked; on an open or closed file the claim is false whatever the side.
        claims.push({ type: "file", file, state, for: side ?? actualSide ?? "white" });
      }
    }
  }
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = JSON.stringify(claim);
    return !seen.has(key) && seen.add(key);
  });
}

function sanKey(san: string) {
  return san.replace(/[+#!?]+$/, "");
}

function formatLine(startPly: number, sans: string[]): string {
  return sans.map((san, i) => {
    const ply = startPly + i;
    const number = Math.floor(ply / 2) + 1;
    return ply % 2 === 0 ? `${number}.${san}` : i === 0 ? `${number}...${san}` : san;
  }).join(" ");
}

export type UnverifiedLine = {
  raw: string;
  /** The opening moves that do follow an engine line, kept when the answer cannot be repaired. */
  keep?: string;
};

/** Lines from the current position that follow neither an engine line nor an explorer move. */
export function offEngineLines(body: string, position: AnswerPosition, context: unknown): UnverifiedLine[] {
  if (!context || typeof context !== "object") return [];
  const pack = context as { engine?: { san?: unknown }[]; lichess?: { san?: unknown }[]; xd?: { san?: unknown }[] };
  const engine = (pack.engine ?? []).flatMap(({ san }) =>
    Array.isArray(san) && san.every((move) => typeof move === "string") ? [san.map(sanKey)] : []);
  if (!engine.length) return [];
  const explorer = new Set([...(pack.lichess ?? []), ...(pack.xd ?? [])]
    .flatMap(({ san }) => typeof san === "string" ? [sanKey(san)] : []));
  const currentPly = fenPly(position.currentFen);
  return parseAnswer(body, position).flatMap((segment) => {
    if (segment.type !== "line" || segment.startPly !== currentPly) return [];
    const moves = segment.moves.map(({ san }) => sanKey(san));
    if (explorer.has(moves[0])) return [];
    const followed = Math.max(...engine.map((pv) => {
      let n = 0;
      while (n < moves.length && pv[n] === moves[n]) n++;
      return n;
    }));
    if (followed === moves.length) return [];
    const keep = followed > 0 ? formatLine(segment.startPly, segment.moves.slice(0, followed).map(({ san }) => san)) : undefined;
    return [keep ? { raw: segment.raw, keep } : { raw: segment.raw }];
  });
}

export function auditAnswer(body: string, claims: Claim[], position: AnswerPosition, context?: unknown) {
  const allClaims = [...claims, ...proseClaims(body, position)];
  const seen = new Set<string>();
  const falseClaims = allClaims.flatMap((claim) => {
    const key = JSON.stringify(claim);
    if (seen.has(key)) return [];
    seen.add(key);
    const truth = claimTruth(claim, position);
    return truth === undefined ? [] : [{ claim, truth }];
  });
  const illegalLines = parseAnswer(body, position).flatMap((segment) =>
    segment.type === "invalid-line" ? [segment.raw] : []);
  const unverifiedLines = offEngineLines(body, position, context);
  return {
    ok: falseClaims.length === 0 && illegalLines.length === 0 && unverifiedLines.length === 0,
    falseClaims, illegalLines, unverifiedLines,
  };
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
    case "on":
      return Array.from(prose.matchAll(PIECE_ON)).some(([, word, square]) =>
        square.toLowerCase() === claim.square && pieceLetter(word) === claim.piece);
    default:
      return mentionsSquare(sentence, claim.piece.slice(-2)) &&
        (!claim.target || mentionsSquare(sentence, claim.target));
  }
}

export function stripFalse(body: string, { falseClaims, illegalLines, unverifiedLines = [] }: ReturnType<typeof auditAnswer>): string {
  const lines = /\[\[([\s\S]*?)\]\]/g;
  // A line that leaves the engine keeps the moves that follow it; with none, its sentence goes.
  const kept = new Map(unverifiedLines.flatMap(({ raw, keep }) => keep ? [[raw, keep]] : []));
  const dropped = unverifiedLines.filter(({ keep }) => !keep).map(({ raw }) => `[[${raw}]]`);
  const withoutIllegal = body.replace(lines, (line, raw: string) =>
    illegalLines.includes(raw) ? "" : kept.has(raw) ? `[[${kept.get(raw)}]]` : line);
  if (!falseClaims.length && !dropped.length) return withoutIllegal.trim();

  return dropSentences(withoutIllegal, (sentence, original) =>
    falseClaims.some(({ claim }) => mentionsClaim(sentence, claim)) ||
    dropped.some((line) => original.includes(line)));
}

function dropSentences(body: string, drop: (sentence: string, original: string) => boolean): string {
  // Keep sentence boundaries outside SAN, including periods in move numbers.
  const masked = body.replace(/\[\[([\s\S]*?)\]\]/g, (line) => " ".repeat(line.length));
  return Array.from(masked.matchAll(/[^\n]+?(?:[.!?]+(?=\s|$)|(?=\n|$))|\n/g))
    .filter(({ 0: sentence, index }) => !drop(sentence, body.slice(index, index + sentence.length)))
    .map(({ 0: sentence, index }) => body.slice(index, index + sentence.length))
    .join("")
    // only the single space left where a dropped sentence started a paragraph
    .replace(/^ (?=\S)/gm, "")
    // a heading whose section lost every sentence goes too
    .replace(/^###[^\n]*\n+(?=###|\s*$)/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Game ids the position pack offers for citation (its xdGames). */
export function packGameIds(context: unknown): Set<string> {
  const games = typeof context === "object" && context !== null ? (context as { xdGames?: unknown }).xdGames : undefined;
  return new Set(Array.isArray(games)
    ? games.flatMap((game) => typeof game?.id === "string" ? [game.id] : [])
    : []);
}

/** Drops sentences that cite a game missing from the pack's xdGames: the chip
 *  would render as nothing and leave a broken sentence ("games like  and  show"). */
export function stripUnknownGames(body: string, context: unknown): string {
  const known = packGameIds(context);
  const citations = /\{\{game:([^{}\r\n]*)\}\}/g;
  if (Array.from(body.matchAll(citations)).every((match) => known.has(match[1].trim()))) return body;
  return dropSentences(body, (sentence) =>
    Array.from(sentence.matchAll(citations)).some((match) => !known.has(match[1].trim())));
}
