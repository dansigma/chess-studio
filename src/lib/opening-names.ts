// SIG-964: PT-BR opening family names keyed by ECO code. Pure data + lookup —
// no UI, no book access. An exact `ECO|English name` composite can distinguish
// openings that share a code (A13 = English + Reti in-book).
import type { SiteLocale } from "../i18n/locale.ts";
import { translateFamily, translateOpeningPart } from "./opening-names-pt-br.ts";

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
  E97: "Defesa Índia do Rei",
  A13: "Abertura Inglesa",
  "A13|Reti Opening": "Abertura Réti",
  D17: "Defesa Eslava",
  D02: "Sistema Londres",
};

/** Localize the book name, using a bare ECO label for unmapped names without a variation suffix. */
export function resolveOpeningName(eco: string, fallbackName: string, locale: SiteLocale): string {
  if (locale !== "pt-br") {
    return fallbackName;
  }
  const code = eco.trim().toUpperCase();
  const localized = localizeOpeningName(fallbackName, locale, code);
  return localized === fallbackName && !fallbackName.includes(":")
    ? PT_BR_OPENING_NAMES[code] ?? fallbackName
    : localized;
}

// SIG-1304: family-level PT-BR names keyed by a normalised English family
// (lowercase, accents stripped, "defence" → "defense", curly → straight
// apostrophes). The glossary tests verify that these original translations
// are preserved.
export const PT_BR_FAMILIES: Record<string, string> = {
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
  "king's indian defense": "Defesa Índia do Rei",
  "queen's indian defense": "Defesa Índia da Dama",
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
  "indian defense": "Defesa Índia",
  "nimzowitsch defense": "Defesa Nimzowitsch",
  "zukertort opening": "Abertura Zukertort",
  "van geet opening": "Abertura Van Geet",
  "pterodactyl defense": "Defesa Pterodáctilo",
  "tarrasch defense": "Defesa Tarrasch",
  "neo-grunfeld defense": "Defesa Neo-Grünfeld",
  "king's indian attack": "Ataque Índio do Rei",
  "old indian defense": "Defesa Índia Antiga",
  "bogo-indian defense": "Defesa Bogo-Índia",
  "trompowsky attack": "Ataque Trompowsky",
  "colle system": "Sistema Colle",
  "english defense": "Defesa Inglesa",
  "owen defense": "Defesa Owen",
  "saint george defense": "Defesa São Jorge",
  "polish opening": "Abertura Polonesa",
  "bird opening": "Abertura Bird",
};

/** Translate the comma-separated parts of a variation or subvariation label. */
export function translateOpeningParts(label: string): string {
  const parts = label.split(",").map((part) => part.trim());
  const translated = parts.map(translateOpeningPart);
  return translated.every((part, index) => part === parts[index]) ? label : translated.join(", ");
}

/** Localize a display name using the PT-BR glossary and exact ECO overrides. */
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
  if (colon !== -1) {
    const family = name.slice(0, colon).trim();
    const suffix = name.slice(colon + 1).trim();
    const translatedFamily = translateFamily(family);
    const translatedSuffix = translateOpeningParts(suffix);
    return translatedFamily === family && translatedSuffix === suffix
      ? name
      : `${translatedFamily}: ${translatedSuffix}`;
  }

  const family = translateFamily(name);
  if (family !== name) {
    return family;
  }

  // Chess.com omits the colon. Try the longest family prefix first, slicing at
  // word boundaries in the original so normalization cannot shift the suffix.
  for (const { index, 0: space } of Array.from(name.matchAll(/\s+(?=\S)/g)).reverse()) {
    const prefix = name.slice(0, index);
    const translated = translateFamily(prefix);
    if (translated !== prefix) {
      return `${translated}${space}${translateOpeningParts(name.slice(index + space.length))}`;
    }
  }
  return name;
}
