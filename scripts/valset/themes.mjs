// SIG-1221: canonical theme list, EN + PT-BR vocabulary, and the explicit
// theme -> fact predicate table used to score the fact extractor (SIG-959).
//
// Every theme is either MAPPED (has a predicate over the facts) or UNMAPPED
// (valid vocabulary, but the extractor has no fact kind for it yet). Unmapped
// themes are never dropped: they are counted and listed in the report so the
// gap list writes itself.
import { Chess } from "chess.js";
import { computeThreats, computeThreatsToMove } from "../../src/chess/facts/index.ts";

/**
 * @typedef {"tactical" | "positional"} ThemeGroup
 * @typedef {{ hit: boolean, scope: string, squares: string[], note: string }} Detection
 * @typedef {{
 *   fen: string,
 *   playedUci: string,
 *   authorBestUci: string | null,
 *   facts: import("../../src/chess/explain/gather.ts").ExplainFacts,
 *   bestFacts: import("../../src/chess/facts/index.ts").MoveFacts | null,
 *   engine: { evalAfterMate: number | null } | null,
 * }} PredicateContext
 * @typedef {{
 *   id: string,
 *   group: ThemeGroup,
 *   label: string,
 *   factKind: string | null,
 *   predicate: ((ctx: PredicateContext) => Detection) | null,
 *   gap?: string,
 * }} ThemeDef
 */

const NO = { hit: false, scope: "none", squares: [], note: "" };
const yes = (scope, squares, note) => ({ hit: true, scope, squares: [...new Set(squares)], note });

const rankChar = (square) => square[1];

function pieceAt(fen, square) {
  try {
    return new Chess(fen).get(square) ?? null;
  } catch {
    return null;
  }
}

function anyPieces(facts, predicate) {
  const out = [];
  for (const [scope, position] of [
    ["after", facts.after],
    ["before", facts.before],
  ]) {
    for (const piece of position.pieces) {
      if (predicate(piece, position)) {
        out.push({ scope, piece });
      }
    }
  }
  return out;
}

// --- tactical predicates ------------------------------------------------------

function forkPredicate(ctx) {
  const { facts, fen, playedUci, authorBestUci } = ctx;
  const available = computeThreatsToMove(fen).threats.filter((t) => t.kind === "fork");
  const played = available.find((t) => t.uci === playedUci);
  if (played) {
    return yes("played", [played.from, played.to, ...played.targets], `played move forks ${played.targets.join("+")}`);
  }
  const created = facts.played.threats.created.find((t) => t.kind === "fork");
  if (created) {
    return yes("created", [created.from, created.to, ...created.targets], `move threatens a fork on ${created.to}`);
  }
  const exposed = facts.played.threats.exposed.find((t) => t.kind === "fork");
  if (exposed) {
    return yes("exposed", [exposed.from, exposed.to, ...exposed.targets], `move allows a fork on ${exposed.to}`);
  }
  const best = authorBestUci ? available.find((t) => t.uci === authorBestUci) : null;
  if (best) {
    return yes("author-best", [best.from, best.to, ...best.targets], `author's move forks ${best.targets.join("+")}`);
  }
  const first = available[0];
  if (first) {
    return yes("available", [first.from, first.to, ...first.targets], `a fork is available on ${first.to}`);
  }
  return NO;
}

function pinPredicate(ctx) {
  const hits = anyPieces(ctx.facts, (piece) => piece.pinned !== null);
  const first = hits[0];
  return first
    ? yes(first.scope, [first.piece.square, first.piece.pinned.by, first.piece.pinned.to], `${first.piece.pinned.kind} pin of ${first.piece.square}`)
    : NO;
}

function skewerPredicate(ctx) {
  for (const [scope, position] of [
    ["after", ctx.facts.after],
    ["before", ctx.facts.before],
  ]) {
    const skewer = position.skewers[0];
    if (skewer) {
      return yes(scope, [skewer.by, skewer.front, skewer.behind], `skewer ${skewer.by} through ${skewer.front} to ${skewer.behind}`);
    }
  }
  return NO;
}

function hangingPredicate(ctx) {
  const hits = anyPieces(ctx.facts, (piece) => piece.hanging && piece.type !== "k");
  const first = hits[0];
  return first ? yes(first.scope, [first.piece.square], `${first.piece.color}${first.piece.type} on ${first.piece.square} is hanging`) : NO;
}

function trappedPredicate(ctx) {
  const hits = anyPieces(ctx.facts, (piece) => piece.trapped);
  const first = hits[0];
  return first ? yes(first.scope, [first.piece.square], `${first.piece.type} on ${first.piece.square} is trapped`) : NO;
}

function mateDeliveredPredicate(ctx) {
  const { played } = ctx.facts;
  if (played.mate) {
    return yes("played", [played.from, played.to], "played move is checkmate");
  }
  if (played.pv?.endsInMate) {
    return yes("pv", [played.from, played.to], "engine line after the move ends in mate");
  }
  if (ctx.engine && ctx.engine.evalAfterMate !== null && ctx.engine.evalAfterMate > 0) {
    return yes("engine", [played.from, played.to], `engine sees mate in ${ctx.engine.evalAfterMate} after the move`);
  }
  return NO;
}

/** Mate-in-1 threats of either side that can be seen around the played move. */
function mateThreats(ctx) {
  const { facts, fen, playedUci } = ctx;
  const out = [];
  const add = (scope, threat, atFen) => out.push({ scope, threat, atFen });
  for (const t of facts.played.threats.created) {
    if (t.kind === "mate-in-1") add("created", t, facts.after.fen);
  }
  for (const t of facts.played.threats.exposed) {
    if (t.kind === "mate-in-1") add("exposed", t, facts.after.fen);
  }
  for (const t of computeThreats(fen).threats) {
    if (t.kind === "mate-in-1") add("opponent-threat", t, fen);
  }
  for (const t of computeThreatsToMove(fen).threats) {
    if (t.kind === "mate-in-1") add(t.uci === playedUci ? "played" : "available", t, fen);
  }
  return out;
}

function mateThreatPredicate(ctx) {
  const first = mateThreats(ctx).find((entry) => entry.scope !== "played");
  return first
    ? yes(first.scope, [first.threat.from, first.threat.to, ...first.threat.targets], `mate in 1 by ${first.threat.uci}`)
    : NO;
}

/**
 * Back rank: the extractor has no dedicated fact, so it is derived from the
 * mate-in-1 facts: a rook or queen mates a king that stands on its own back
 * rank by landing on that same rank.
 */
function backRankPredicate(ctx) {
  const candidates = mateThreats(ctx).map(({ scope, threat, atFen }) => ({ scope, threat, atFen }));
  if (ctx.facts.played.mate) {
    const { played, after } = ctx.facts;
    candidates.push({
      scope: "played",
      threat: { from: played.from, to: played.to, uci: played.uci, targets: after.kings.filter((k) => k.color !== played.mover).map((k) => k.square) },
      atFen: ctx.fen,
    });
  }
  for (const { scope, threat, atFen } of candidates) {
    const king = threat.targets[0];
    const mating = pieceAt(atFen, threat.from) ?? pieceAt(atFen, threat.to);
    if (!king || !mating || (mating.type !== "r" && mating.type !== "q")) {
      continue;
    }
    const kingPiece = pieceAt(atFen, king);
    const backRank = kingPiece?.color === "w" ? "1" : "8";
    if (kingPiece?.type === "k" && rankChar(king) === backRank && rankChar(threat.to) === backRank) {
      return yes(scope, [threat.from, threat.to, king], `${mating.type} mates the king on its back rank (${threat.uci})`);
    }
  }
  return NO;
}

function sacrificePredicate(ctx) {
  const { played } = ctx.facts;
  return played.sacrifice ? yes("played", [played.from, played.to], "played move gives up material") : NO;
}

function discoveredPredicate(ctx) {
  const { played, after } = ctx.facts;
  for (const entry of played.unblocks) {
    const target = entry.gained.find((square) => {
      const piece = after.pieces.find((p) => p.square === square);
      return piece && piece.color !== played.mover && piece.type !== "p";
    });
    if (target) {
      return yes("played", [played.from, entry.square, target], `moving ${played.from} uncovers ${entry.square} against ${target}`);
    }
  }
  return NO;
}

function xrayPredicate(ctx) {
  const hits = anyPieces(ctx.facts, (piece) => piece.xrayThrough.length > 0);
  const first = hits[0];
  const through = first?.piece.xrayThrough[0];
  return first && through ? yes(first.scope, [first.piece.square, through.through, through.target], `x-ray from ${first.piece.square}`) : NO;
}

// --- positional predicates ----------------------------------------------------

function pawnKind(kind) {
  return (ctx) => {
    for (const [scope, position] of [
      ["after", ctx.facts.after],
      ["before", ctx.facts.before],
    ]) {
      const pawn = position.pawns.find((p) => p.kind === kind);
      if (pawn) {
        return yes(scope, [pawn.square, ...pawn.with], `${kind} pawn on ${pawn.square}`);
      }
    }
    return NO;
  };
}

function outpostPredicate(ctx) {
  const outpost = ctx.facts.after.outposts[0] ?? ctx.facts.before.outposts[0];
  return outpost ? yes("after", [outpost.square], `outpost on ${outpost.square}`) : NO;
}

function openFilePredicate(ctx) {
  const file = ctx.facts.after.files.find((f) => f.openness === "open" && f.heavyPieces.length > 0);
  return file ? yes("after", file.heavyPieces, `open file ${file.file} used by a heavy piece`) : NO;
}

function seventhPredicate(ctx) {
  const entry = ctx.facts.after.seventhRank.find((e) => e.squares.length > 0);
  return entry ? yes("after", entry.squares, `heavy piece on the seventh rank (${entry.color})`) : NO;
}

function weakSquarePredicate(ctx) {
  const weak = ctx.facts.after.weakSquares[0];
  return weak ? yes("after", [weak.square], `weak square ${weak.square} for ${weak.side}`) : NO;
}

function kingSafetyPredicate(ctx) {
  const king = ctx.facts.after.kings.find((k) => k.castling === "castled" && !k.shieldIntact);
  return king ? yes("after", [king.square], `castled king on ${king.square} has a damaged pawn shield`) : NO;
}

const UNMAPPED_GAP = "no fact kind in src/chess/facts for this motif";

/** @type {ThemeDef[]} */
export const THEMES = [
  { id: "fork", group: "tactical", label: "Fork", factKind: "Threat.kind=fork", predicate: forkPredicate },
  { id: "pin", group: "tactical", label: "Pin", factKind: "PieceFact.pinned", predicate: pinPredicate },
  { id: "skewer", group: "tactical", label: "Skewer", factKind: "PositionFacts.skewers", predicate: skewerPredicate },
  { id: "hanging", group: "tactical", label: "Hanging piece", factKind: "PieceFact.hanging", predicate: hangingPredicate },
  { id: "trapped", group: "tactical", label: "Trapped piece", factKind: "PieceFact.trapped", predicate: trappedPredicate },
  { id: "back-rank", group: "tactical", label: "Back rank", factKind: "derived: Threat.kind=mate-in-1 by R/Q on the king's back rank", predicate: backRankPredicate, gap: "no dedicated back-rank fact; only mate in 1 is recognised" },
  { id: "mate-threat", group: "tactical", label: "Mate threat", factKind: "Threat.kind=mate-in-1", predicate: mateThreatPredicate },
  { id: "mate", group: "tactical", label: "Checkmate / forced mate", factKind: "MoveFacts.mate / PvFacts.endsInMate", predicate: mateDeliveredPredicate },
  { id: "sacrifice", group: "tactical", label: "Sacrifice", factKind: "MoveFacts.sacrifice", predicate: sacrificePredicate },
  { id: "discovered-attack", group: "tactical", label: "Discovered attack", factKind: "MoveFacts.unblocks", predicate: discoveredPredicate },
  { id: "xray", group: "tactical", label: "X-ray", factKind: "PieceFact.xrayThrough", predicate: xrayPredicate },
  { id: "passed-pawn", group: "positional", label: "Passed pawn", factKind: "PawnFact.kind=passed", predicate: pawnKind("passed") },
  { id: "isolated-pawn", group: "positional", label: "Isolated pawn", factKind: "PawnFact.kind=isolated", predicate: pawnKind("isolated") },
  { id: "doubled-pawns", group: "positional", label: "Doubled pawns", factKind: "PawnFact.kind=doubled", predicate: pawnKind("doubled") },
  { id: "backward-pawn", group: "positional", label: "Backward pawn", factKind: "PawnFact.kind=backward", predicate: pawnKind("backward") },
  { id: "outpost", group: "positional", label: "Outpost", factKind: "PositionFacts.outposts", predicate: outpostPredicate },
  { id: "open-file", group: "positional", label: "Open file", factKind: "FileFact (heavy piece)", predicate: openFilePredicate },
  { id: "seventh-rank", group: "positional", label: "Seventh rank", factKind: "PositionFacts.seventhRank", predicate: seventhPredicate },
  { id: "weak-square", group: "positional", label: "Weak square", factKind: "PositionFacts.weakSquares", predicate: weakSquarePredicate },
  { id: "king-safety", group: "positional", label: "King safety", factKind: "KingSafetyFact", predicate: kingSafetyPredicate },
  // Recognised vocabulary with no fact kind yet: reported, never dropped.
  ...[
    ["deflection", "tactical", "Deflection"],
    ["decoy", "tactical", "Decoy / attraction"],
    ["overloading", "tactical", "Overloaded piece"],
    ["interference", "tactical", "Interference"],
    ["zwischenzug", "tactical", "In-between move"],
    ["desperado", "tactical", "Desperado"],
    ["zugzwang", "positional", "Zugzwang"],
    ["initiative", "positional", "Initiative / tempo"],
    ["prophylaxis", "positional", "Prophylaxis"],
    ["development", "positional", "Development"],
    ["space", "positional", "Space advantage"],
  ].map(([id, group, label]) => ({ id, group, label, factKind: null, predicate: null, gap: UNMAPPED_GAP })),
];

export const THEME_IDS = THEMES.map((theme) => theme.id);
const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function themeById(id) {
  return BY_ID.get(id) ?? null;
}

export function isMappedTheme(id) {
  return BY_ID.get(id)?.predicate != null;
}

/** Theme -> fact-kind table (for the report and the README). */
export function mappingTable() {
  return THEMES.map(({ id, group, factKind, gap }) => ({ id, group, factKind, mapped: factKind !== null, gap: gap ?? null }));
}

// --- vocabulary -----------------------------------------------------------------

/** Lowercase, strip accents, collapse punctuation to single spaces. */
export function normalizeText(text) {
  return String(text)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Phrases are matched on normalised text (no accents, punctuation -> space), as
 * regex source with word boundaries added around each alternative.
 * EN and PT-BR share one table; add new author vocabulary here.
 */
export const SYNONYMS = {
  fork: ["forks?", "forked", "forking", "double attack", "garfos?", "ataque duplo", "forquilha"],
  pin: ["pins?", "pinned", "pinning", "cravad[oa]s?", "cravacao", "cravacoes", "cravamento", "cravar", "cravando"],
  skewer: ["skewers?", "skewered", "skewering", "espetos?", "espetar"],
  hanging: ["hanging", "hangs", "en prise", "loose piece", "undefended piece", "unprotected piece", "pecas? penduradas?", "pecas? soltas?", "pecas? desprotegidas?", "pecas? indefesas?", "pendurou", "pendurad[oa]s?"],
  trapped: ["trapped", "traps?", "trapping", "aprisionad[oa]s?", "encurralad[oa]s?", "(?:peca|dama|bispo|cavalo|torre) pres[oa]"],
  "back-rank": ["back rank", "backrank", "last rank", "eighth rank mate", "ultima fileira", "ultima linha", "linha de fundo", "fileira de fundo", "mate do corredor", "corredor"],
  "mate-threat": ["mate threats?", "threat of mate", "threatens? mate", "threatening mate", "mating threat", "threatens? checkmate", "ameacas? de mate", "ameaca o mate", "ameacand[oa] (?:o )?mate", "ameacam? (?:o )?mate"],
  mate: ["checkmates?", "checkmated", "mate in (?:\\d|one|two|three|four)", "forced mate", "xeque mate", "mate em (?:\\d|um|dois|tres|quatro)", "mate forcado", "da mate", "dar mate"],
  sacrifice: ["sacrific\\w*", "sacrificio\\w*", "sacrifica\\w*"],
  "discovered-attack": ["discovered (?:attack|check)", "ataque descoberto", "xeque descoberto"],
  xray: ["x ray", "xray", "raio x"],
  "passed-pawn": ["passed pawns?", "peao passado", "peoes passados"],
  "isolated-pawn": ["isolated pawns?", "peao isolado", "peoes isolados"],
  "doubled-pawns": ["doubled pawns?", "peao dobrado", "peoes dobrados"],
  "backward-pawn": ["backward pawns?", "peao atrasado", "peoes atrasados"],
  outpost: ["outposts?", "posto avancado"],
  "open-file": ["open file", "coluna aberta"],
  "seventh-rank": ["seventh rank", "7th rank", "setima fileira", "setima linha"],
  "weak-square": ["weak squares?", "casas? fracas?"],
  "king-safety": ["king safety", "exposed king", "weakened king", "seguranca do rei", "rei exposto"],
  deflection: ["deflect\\w*", "desvio", "desviar"],
  decoy: ["decoy\\w*", "attraction", "atracao"],
  overloading: ["overload\\w*", "sobrecarga\\w*"],
  interference: ["interference", "interferencia"],
  zwischenzug: ["zwischenzug", "intermediate move", "in between move", "lance intermediario"],
  desperado: ["desperado"],
  zugzwang: ["zugzwang"],
  initiative: ["initiative", "iniciativa"],
  prophylaxis: ["prophyla\\w+", "profilaxia", "profilatic\\w*"],
  development: ["development", "develops?", "desenvolvimento", "desenvolve"],
  space: ["space advantage", "gains? space", "vantagem de espaco", "ganha espaco"],
};

const COMPILED = Object.entries(SYNONYMS).map(([theme, phrases]) => [
  theme,
  new RegExp(`(?:^| )(?:${phrases.join("|")})(?= |$)`, "g"),
]);

const NEGATORS = new Set(["no", "not", "never", "without", "nor", "avoid", "avoids", "avoiding", "nao", "sem", "nunca", "nem", "evita", "evitar", "evitando", "dont", "doesnt", "isnt", "cant", "cannot"]);

/**
 * Detect themes in free author text.
 * A phrase preceded by a negator within three words ("no fork", "sem garfo")
 * is listed in `negated` and not counted.
 * @returns {{ themes: string[], negated: string[] }}
 */
export function detectThemes(text) {
  const normalized = normalizeText(text ?? "");
  const found = new Set();
  const negated = new Set();
  for (const [theme, pattern] of COMPILED) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const before = normalized.slice(0, match.index).split(" ").filter(Boolean).slice(-3);
      if (before.some((word) => NEGATORS.has(word))) {
        negated.add(theme);
      } else {
        found.add(theme);
      }
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  const order = (id) => THEME_IDS.indexOf(id);
  return {
    themes: [...found].sort((a, b) => order(a) - order(b)),
    negated: [...negated].filter((id) => !found.has(id)).sort((a, b) => order(a) - order(b)),
  };
}

/** Resolve one explicit tag (`fork`, `Back Rank`, `garfo`...) to a canonical theme id, or null. */
export function resolveThemeTag(tag) {
  const normalized = normalizeText(tag);
  if (!normalized) {
    return null;
  }
  const id = normalized.replaceAll(" ", "-");
  if (BY_ID.has(id)) {
    return id;
  }
  for (const [theme, pattern] of COMPILED) {
    pattern.lastIndex = 0;
    const match = pattern.exec(normalized);
    if (match && match[0].trim() === normalized) {
      return theme;
    }
  }
  return null;
}

/**
 * Parse the explicit hand-label tags of a comment:
 *   [%themes fork,pin]  [%mustmention fork]  [%mustnotclaim pin]
 * Unknown theme words are returned in `unknown`, never dropped silently.
 * @returns {{ text: string, themes: string[] | null, mustMention: string[], mustNotClaim: string[], unknown: string[] }}
 */
export function parseThemeTags(comment) {
  const unknown = [];
  const collect = (command) => {
    let found = null;
    for (const match of String(comment ?? "").matchAll(new RegExp(`(?:\\[%${command}\\s+([^\\]]*)\\]|@@${command}:([^@]*)@@)`, "gi"))) {
      found ??= [];
      for (const raw of (match[1] ?? match[2] ?? "").split(/[,;]+/)) {
        const token = raw.trim();
        if (!token) continue;
        const id = resolveThemeTag(token);
        if (id) {
          if (!found.includes(id)) found.push(id);
        } else {
          unknown.push(token);
        }
      }
    }
    return found;
  };
  const themes = collect("themes");
  const mustMention = collect("mustmention") ?? [];
  const mustNotClaim = collect("mustnotclaim") ?? [];
  const text = String(comment ?? "")
    .replace(/\[%(?:themes|mustmention|mustnotclaim)\s+[^\]]*\]/gi, " ")
    .replace(/@@(?:themes|mustmention|mustnotclaim):[^@]*@@/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, themes, mustMention, mustNotClaim, unknown };
}

/** Squares named in the author's text ("fork on c7"). */
export function squaresInText(text) {
  const bare = String(text ?? "").replace(/\b[KQRBN]?x?(?=[a-h][1-8]\b)/g, " ");
  return [...new Set(bare.toLowerCase().match(/\b[a-h][1-8]\b/g) ?? [])];
}
