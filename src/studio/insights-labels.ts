// SIG-959: tiny EN + PT-BR table for the Insights panel's headings and tags.
// The facts layer carries no prose; this table only names things.

export type InsightsLang = "en" | "pt";

const EN = {
  title: "Position insights",
  tabPieces: "Pieces",
  tabThreats: "Threats",
  tabConcepts: "Concepts",
  white: "White",
  black: "Black",
  emptySetup: "Insights are paused while setting up a position.",
  emptyInvalid: "This position cannot be analysed.",
  beforeMove: "Before move",
  afterMove: "After move",
  currentPosition: "Current position",
  threatsAgainst: "Threats against the mover",
  threatsRemaining: "Threats still standing",
  threatsCreated: "New follow-up threats",
  neutralized: "Neutralized",
  exposed: "Newly exposed",
  noThreats: "No threats.",
  inCheck: "In check: no null-move threats to show.",
  gameOver: "The game is over here.",
  noConcepts: "Nothing notable yet.",
  tagHanging: "hanging",
  tagPinnedAbsolute: "pinned to king",
  tagPinnedRelative: "pinned",
  tagXray: "x-ray",
  tagBlocked: "blocked",
  tagTrapped: "trapped",
  tagLoose: "loose",
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn",
  "mate-in-1": "Mate in 1",
  "hanging-capture": "Wins a loose piece",
  "winning-capture": "Wins material",
  fork: "Fork",
  "open-file": "Open file",
  "half-open-file": "Half-open file",
  "seventh-rank": "Rook on the 7th",
  "long-diagonal": "Long diagonal",
  "weak-square": "Weak square",
  outpost: "Outpost",
  isolated: "Isolated pawn",
  doubled: "Doubled pawns",
  passed: "Passed pawn",
  backward: "Backward pawn",
  skewer: "Skewer",
  castled: "Castled king",
  uncastled: "Uncastled king",
  "shield-intact": "Pawn shield intact",
  "shield-broken": "Pawn shield broken",
  "open-toward-king": "Open file toward king",
} as const;

export type InsightsLabelKey = keyof typeof EN;

const PT: Record<InsightsLabelKey, string> = {
  title: "Insights da posição",
  tabPieces: "Peças",
  tabThreats: "Ameaças",
  tabConcepts: "Conceitos",
  white: "Brancas",
  black: "Pretas",
  emptySetup: "Os insights ficam em pausa durante a montagem da posição.",
  emptyInvalid: "Esta posição não pode ser analisada.",
  beforeMove: "Antes do lance",
  afterMove: "Depois do lance",
  currentPosition: "Posição atual",
  threatsAgainst: "Ameaças contra quem jogou",
  threatsRemaining: "Ameaças que continuam",
  threatsCreated: "Novas ameaças do lance",
  neutralized: "Neutralizadas",
  exposed: "Recém-expostas",
  noThreats: "Sem ameaças.",
  inCheck: "Em xeque: sem ameaças de lance nulo para mostrar.",
  gameOver: "A partida terminou aqui.",
  noConcepts: "Nada de notável ainda.",
  tagHanging: "desprotegida",
  tagPinnedAbsolute: "cravada ao rei",
  tagPinnedRelative: "cravada",
  tagXray: "raio-X",
  tagBlocked: "bloqueado",
  tagTrapped: "presa",
  tagLoose: "solta",
  king: "Rei",
  queen: "Dama",
  rook: "Torre",
  bishop: "Bispo",
  knight: "Cavalo",
  pawn: "Peão",
  "mate-in-1": "Mate em 1",
  "hanging-capture": "Ganha peça solta",
  "winning-capture": "Ganha material",
  fork: "Garfo",
  "open-file": "Coluna aberta",
  "half-open-file": "Coluna semiaberta",
  "seventh-rank": "Torre na 7ª",
  "long-diagonal": "Diagonal longa",
  "weak-square": "Casa fraca",
  outpost: "Posto avançado",
  isolated: "Peão isolado",
  doubled: "Peões dobrados",
  passed: "Peão passado",
  backward: "Peão atrasado",
  skewer: "Espeto",
  castled: "Rei roqueado",
  uncastled: "Rei sem roque",
  "shield-intact": "Escudo de peões intacto",
  "shield-broken": "Escudo de peões quebrado",
  "open-toward-king": "Coluna aberta para o rei",
};

const TABLES: Record<InsightsLang, Record<InsightsLabelKey, string>> = { en: EN, pt: PT };

export function insightsLabel(lang: InsightsLang, key: InsightsLabelKey): string {
  return TABLES[lang][key];
}

export function insightsLangFrom(locale: string | undefined): InsightsLang {
  return locale?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function insightsLabelKeys(): InsightsLabelKey[] {
  return Object.keys(EN) as InsightsLabelKey[];
}

export const PIECE_NAME_KEY = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
} as const satisfies Record<string, InsightsLabelKey>;

export const PIECE_GLYPH = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
} as const;
