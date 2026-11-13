// SIG-964: PT-BR opening family names keyed by ECO code. Pure data + lookup —
// no UI, no book access. Bare ECO lookup first; `ECO|English name` composite
// wins when one code covers two families (A13 = English + Reti in-book).
// Unknown ECOs fall back to the English book name verbatim.
import type { SiteLocale } from "../i18n/locale.ts";

export const PT_BR_OPENING_NAMES: Record<string, string> = {
  C41: "Defesa Philidor",
  C33: "Gambito do Rei Aceito",
  C52: "Gambito Evans",
  C92: "Ruy López",
  B90: "Defesa Siciliana: Variante Najdorf",
  B20: "Defesa Siciliana",
  C11: "Defesa Francesa",
  B12: "Defesa Caro-Kann",
  D59: "Gambito da Dama Recusado",
  E34: "Defesa Nimzoíndia",
  E97: "Defesa Índiana do Rei",
  A13: "Abertura Inglesa",
  "A13|Reti Opening": "Abertura Réti",
  D17: "Defesa Eslava",
  D02: "Sistema Londres",
};

/** PT-BR book name when mapped, else the English fallback verbatim. EN always returns the fallback. */
export function resolveOpeningName(eco: string, fallbackName: string, locale: SiteLocale): string {
  if (locale !== "pt-br") {
    return fallbackName;
  }
  const code = eco.trim().toUpperCase();
  return PT_BR_OPENING_NAMES[`${code}|${fallbackName}`] ?? PT_BR_OPENING_NAMES[code] ?? fallbackName;
}

// SIG-1304: family-level PT-BR names keyed by a normalised English family
// (lowercase, accents stripped, "defence" → "defense", curly → straight
// apostrophes). Only the family before ":" is translated; the variation
// suffix stays as the book spelled it.
const PT_BR_FAMILIES: Record<string, string> = {
  "sicilian defense": "Defesa Siciliana",
  "french defense": "Defesa Francesa",
  "caro-kann defense": "Defesa Caro-Kann",
  "queen's gambit declined": "Gambito da Dama Recusado",
  "queen's gambit accepted": "Gambito da Dama Aceito",
  "queen's gambit": "Gambito da Dama",
  "queen's pawn game": "Jogo do Peão da Dama",
  "queen's pawn opening": "Abertura do Peão da Dama",
  "king's pawn game": "Jogo do Peão do Rei",
  "king's pawn opening": "Abertura do Peão do Rei",
  "king's indian defense": "Defesa Índiana do Rei",
  "queen's indian defense": "Defesa Índiana da Dama",
  "nimzo-indian defense": "Defesa Nimzoíndia",
  "slav defense": "Defesa Eslava",
  "semi-slav defense": "Defesa Semi-Eslava",
  "english opening": "Abertura Inglesa",
  "italian game": "Jogo Italiano",
  "ruy lopez": "Ruy López",
  "scotch game": "Jogo Escocês",
  "philidor defense": "Defesa Philidor",
  "pirc defense": "Defesa Pirc",
  "modern defense": "Defesa Moderna",
  "scandinavian defense": "Defesa Escandinava",
  "alekhine defense": "Defesa Alekhine",
  "dutch defense": "Defesa Holandesa",
  "grunfeld defense": "Defesa Grünfeld",
  "benoni defense": "Defesa Benoni",
  "london system": "Sistema Londres",
  "reti opening": "Abertura Réti",
  "king's gambit": "Gambito do Rei",
  "king's gambit accepted": "Gambito do Rei Aceito",
  "king's gambit declined": "Gambito do Rei Recusado",
  "vienna game": "Jogo Vienense",
  "petrov's defense": "Defesa Petrov",
  "russian game": "Jogo Russo",
  "four knights game": "Jogo dos Quatro Cavalos",
  "three knights game": "Jogo dos Três Cavalos",
  "two knights defense": "Defesa dos Dois Cavalos",
  "bishop's opening": "Abertura do Bispo",
  "catalan opening": "Abertura Catalã",
  "evans gambit": "Gambito Evans",
  "giuoco piano": "Giuoco Piano",
  "center game": "Jogo do Centro",
  "danish gambit": "Gambito Dinamarquês",
  "latvian gambit": "Gambito Letão",
  "budapest defense": "Defesa Budapeste",
  "old indian defense": "Defesa Índiana Antiga",
  "bogo-indian defense": "Defesa Bogo-Índiana",
  "trompowsky attack": "Ataque Trompowsky",
  "colle system": "Sistema Colle",
  "english defense": "Defesa Inglesa",
  "owen defense": "Defesa Owen",
  "saint george defense": "Defesa São Jorge",
  "polish opening": "Abertura Polonesa",
  "bird opening": "Abertura Bird",
};

function normaliseFamily(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\bdefence\b/g, "defense")
    .replace(/\s+/g, " ")
    .trim();
}

const FAMILY_KEYS_LONGEST_FIRST = Object.keys(PT_BR_FAMILIES).sort((a, b) => b.length - a.length);

/**
 * Display-only PT-BR translation of an English opening name. Translates the
 * family before the first ":" and keeps the variation suffix verbatim; names
 * without a colon also match a known family followed by a space (Chess.com
 * style). Unknown names, and every non-pt-br locale, return `name` unchanged.
 * An optional ECO only helps via the exact `ECO|name` composite entries.
 */
export function localizeOpeningName(name: string, locale: SiteLocale, eco?: string | null): string {
  if (locale !== "pt-br") {
    return name;
  }
  if (eco) {
    const composite = PT_BR_OPENING_NAMES[`${eco.trim().toUpperCase()}|${name}`];
    if (composite) {
      return composite;
    }
  }
  const colon = name.indexOf(":");
  const family = colon === -1 ? name : name.slice(0, colon);
  const suffix = colon === -1 ? "" : name.slice(colon);
  const exact = PT_BR_FAMILIES[normaliseFamily(family)];
  if (exact) {
    return `${exact}${suffix}`;
  }
  if (colon === -1) {
    const normalised = normaliseFamily(name);
    for (const key of FAMILY_KEYS_LONGEST_FIRST) {
      if (normalised.startsWith(`${key} `)) {
        // Normalisation only strips combining marks / swaps spellings of equal
        // length except "defence"→"defense" (same length), so slicing the
        // original by the key's length is safe.
        return `${PT_BR_FAMILIES[key]}${name.slice(key.length)}`;
      }
    }
  }
  return name;
}
