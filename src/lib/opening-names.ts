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
  D02: "Sistema London",
};

/** PT-BR book name when mapped, else the English fallback verbatim. EN always returns the fallback. */
export function resolveOpeningName(eco: string, fallbackName: string, locale: SiteLocale): string {
  if (locale !== "pt-br") {
    return fallbackName;
  }
  const code = eco.trim().toUpperCase();
  return PT_BR_OPENING_NAMES[`${code}|${fallbackName}`] ?? PT_BR_OPENING_NAMES[code] ?? fallbackName;
}
