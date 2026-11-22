// SIG-1441: pure PT-BR glossary for opening names, driven by
// opening-names-pt-br.json. Rules beat rows: an exact override wins, then
// tokens translate — the trailing head word ("Variation", "Gambit", ...) moves
// to the front, adjectives agree with the head's gender, hyphenated prefixes
// keep their structure ("Anti-Moscow" → "Anti-Moscou") and unknown tokens
// (usually person names) pass through verbatim.
import glossaryJson from "../data/opening-names-pt-br.json" with { type: "json" };

/** One glossary row: the PT-BR rendering plus optional agreement data. */
export type PtBrGlossaryEntry = Readonly<{
  /** PT-BR rendering; masculine form when the word inflects. */
  pt: string;
  /** Feminine form, used when the head word of the part is feminine. */
  ptF?: string;
  /** Head words lead the translated part ("Gambit Declined" → "Gambito ..."). */
  head?: boolean;
  /** Gender of a head word, driving adjective agreement. */
  gender?: "m" | "f";
}>;

type GlossaryShape = Readonly<{
  families: Readonly<Record<string, string>>;
  terms: Readonly<Record<string, PtBrGlossaryEntry>>;
  places: Readonly<Record<string, PtBrGlossaryEntry>>;
  overrides: Readonly<Record<string, string>>;
}>;

const glossary = glossaryJson as GlossaryShape;
const FAMILIES = glossary.families;
const TERMS = glossary.terms;
const PLACES = glossary.places;
const OVERRIDES = glossary.overrides;

const TERMS_LOWER = new Map(Object.entries(TERMS).map(([word, entry]) => [word.toLowerCase(), entry]));
const PLACES_LOWER = new Map(Object.entries(PLACES).map(([word, entry]) => [word.toLowerCase(), entry]));

// The families map is keyed by lowercase accent-stripped English with straight apostrophes.
function normaliseFamily(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\bdefence\b/g, "defense")
    .replace(/\s+/g, " ")
    .trim();
}

/** PT-BR family name from the glossary, or the English family verbatim. */
export function translateFamily(family: string): string {
  const key = normaliseFamily(family);
  return Object.hasOwn(FAMILIES, key) ? FAMILIES[key] : family;
}

type Word = Readonly<{ text: string; entry: PtBrGlossaryEntry | null }>;
type Token = Readonly<{ text: string; words: readonly Word[] }>;

function lookupWord(word: string): PtBrGlossaryEntry | null {
  const key = word.toLowerCase();
  return TERMS_LOWER.get(key) ?? PLACES_LOWER.get(key) ?? null;
}

// Possessive person names ("From's Gambit" → "Gambito From") resolve through
// their base form; a known base ("King's" → King → Rei) keeps the entry.
function resolveWord(word: string): Word {
  const entry = lookupWord(word);
  if (entry) return { text: word, entry };
  const base = word.replace(/['’]s?$/, "");
  if (base !== word && base !== "") {
    return { text: base, entry: lookupWord(base) };
  }
  return { text: word, entry: null };
}

function resolveToken(token: string): Token {
  if (!token.includes("-")) {
    const word = resolveWord(token);
    return { text: token, words: [word] };
  }
  const words = token.split("-").filter(Boolean).map(resolveWord);
  return { text: token, words };
}

function wordText(word: Word, headGender: "m" | "f" | null): string {
  if (!word.entry) return word.text;
  if (headGender === "f" && word.entry.ptF) return word.entry.ptF;
  return word.entry.pt;
}

function tokenText(token: Token, headGender: "m" | "f" | null): string {
  if (token.words.length === 1) {
    return wordText(token.words[0], headGender);
  }
  // A hyphenated token stays verbatim when none of its segments is glossed
  // (person compounds like "Blackmar-Diemer"); otherwise each segment
  // translates in place and the hyphen structure survives.
  if (!token.words.some((word) => word.entry)) {
    return token.text;
  }
  return token.words.map((word) => wordText(word, headGender)).join("-");
}

function findHeadIndex(tokens: readonly Token[]): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const word = tokens[i].words[0];
    if (tokens[i].words.length === 1 && word?.entry?.head) {
      return i;
    }
  }
  return -1;
}

/** PT-BR variation part: override first, else token rules. Unknown parts pass through. */
export function translateOpeningPart(part: string): string {
  const key = part.trim().replace(/[’‘]/g, "'");
  if (Object.hasOwn(OVERRIDES, key)) return OVERRIDES[key];
  const tokens = part.trim().split(/\s+/).filter(Boolean).map(resolveToken);
  if (!tokens.some((token) => token.words.some((word) => word.entry))) return part;
  const headIndex = findHeadIndex(tokens);
  const headGender = headIndex === -1 ? null : tokens[headIndex].words[0]?.entry?.gender ?? null;
  const pieces: string[] = [];
  if (headIndex !== -1) {
    pieces.push(tokenText(tokens[headIndex], headGender));
  }
  for (let i = 0; i < tokens.length; i++) {
    if (i !== headIndex) {
      pieces.push(tokenText(tokens[i], headGender));
    }
  }
  return pieces.join(" ");
}

// Generic English words that must never survive into a PT-BR rendering; the
// report script and the catalog-wide tests fail when any of them does.
const CORE_GENERIC_WORDS = new Set([
  "variation", "variations", "gambit", "countergambit", "defense", "defenses", "defence", "attack", "line", "lines",
  "system", "systems", "opening", "game", "games", "formation", "trap", "counterattack", "counterthrust", "sacrifice",
  "invitation", "connection", "transfer", "order", "move", "tour", "endgame", "refutation", "check", "castling",
  "blockade", "battery", "development", "plan", "extension", "deviation", "deviations", "accepted", "declined",
  "deferred", "delayed", "refused", "reversed", "inverted", "accelerated", "hyperaccelerated", "improved", "extended",
  "modern", "classical", "old", "new", "double", "closed", "open", "main", "exchange", "advance", "fianchetto",
  "pawn", "pawns", "knight", "knights", "bishop", "rook", "rooks", "queen", "king", "kingside", "queenside", "flank",
  "center", "wing", "hedgehog", "dragon", "with", "and",
]);

/**
 * English generic words that survived into `translated`. Glossary words whose
 * own PT rendering legitimately contains the English spelling (invariant words
 * like "Anti", places like "de Paris") are excluded, so only real misses show.
 */
export function findEnglishGenericSurvivors(translated: string): string[] {
  const survivors = new Set<string>();
  for (const raw of translated.split(/[\s-]+/)) {
    const word = raw.replace(/['’]s?$/, "").toLowerCase();
    if (!word) continue;
    if (CORE_GENERIC_WORDS.has(word)) {
      survivors.add(word);
      continue;
    }
    const entry = lookupWord(word);
    if (entry && !entry.pt.toLowerCase().includes(word) && !(entry.ptF ?? "").toLowerCase().includes(word)) {
      survivors.add(word);
    }
  }
  return [...survivors].sort();
}

/** Whether `word` (exact, case-insensitive or possessive-stripped) has a glossary entry. */
export function isKnownWord(word: string): boolean {
  if (lookupWord(word)) return true;
  const base = word.replace(/['’]s?$/, "");
  return base !== word && base !== "" && lookupWord(base) !== null;
}

/** Whether `part` resolves through an exact override entry. */
export function isOverriddenOpeningPart(part: string): boolean {
  return OVERRIDES[part.trim().replace(/[’‘]/g, "'")] !== undefined;
}
