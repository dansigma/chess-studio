// SIG-1092: repertoire-mark string catalog (board context menu entries).
// Strict EN + PT-BR tables via `createT` (same grain as
// src/i18n/auth-strings.ts): a missing PT-BR key fails `tsc`.
import { createT } from "./create-t.ts";

export const REPERTOIRE_STRING_KEYS = [
  "repertoire.mark.useWhite",
  "repertoire.mark.useBlack",
  "repertoire.mark.remove",
] as const;

export type RepertoireStringKey = (typeof REPERTOIRE_STRING_KEYS)[number];

const EN: Record<RepertoireStringKey, string> = {
  "repertoire.mark.useWhite": "Use as White repertoire",
  "repertoire.mark.useBlack": "Use as Black repertoire",
  "repertoire.mark.remove": "Remove repertoire mark",
};

const PT_BR: Record<RepertoireStringKey, string> = {
  "repertoire.mark.useWhite": "Usar como repertório de Brancas",
  "repertoire.mark.useBlack": "Usar como repertório de Pretas",
  "repertoire.mark.remove": "Remover marca de repertório",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tRepertoire = createT(EN, PT_BR);
