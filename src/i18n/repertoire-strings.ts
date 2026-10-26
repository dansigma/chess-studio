// SIG-1092: repertoire-mark string catalog (board context menu entries).
// SIG-1093: deviation badge + review-line sentences (whole-sentence
// templates with single {move}/{played}/{repertoire} placeholders).
// Strict EN + PT-BR tables via `createT` (same grain as
// src/i18n/auth-strings.ts): a missing PT-BR key fails `tsc`.
import { createT } from "./create-t.ts";

export const REPERTOIRE_STRING_KEYS = [
  "repertoire.mark.useWhite",
  "repertoire.mark.useBlack",
  "repertoire.mark.remove",
  "repertoire.deviation.leftBadge",
  "repertoire.deviation.gapBadge",
  "repertoire.deviation.lineEnded",
  "repertoire.deviation.noRepertoireHint",
  "repertoire.deviation.reviewUser",
  "repertoire.deviation.reviewGap",
  "repertoire.deviation.trainLine",
  "repertoire.deviation.addGap",
  "repertoire.deviation.noBoard",
  "repertoire.deviation.gapAdded",
  "repertoire.deviation.gapInvalid",
  "repertoire.deviation.missingLine",
] as const;

export type RepertoireStringKey = (typeof REPERTOIRE_STRING_KEYS)[number];

const EN: Record<RepertoireStringKey, string> = {
  "repertoire.mark.useWhite": "Use as White repertoire",
  "repertoire.mark.useBlack": "Use as Black repertoire",
  "repertoire.mark.remove": "Remove repertoire mark",
  "repertoire.deviation.leftBadge": "Left your repertoire at {move}",
  "repertoire.deviation.gapBadge": "Opponent novelty at {move}",
  "repertoire.deviation.lineEnded": "Line ended",
  "repertoire.deviation.noRepertoireHint":
    "Mark a board as your White or Black repertoire from the board menu to see deviations.",
  "repertoire.deviation.reviewUser": "You left your repertoire at {played}; your line is {repertoire}",
  "repertoire.deviation.reviewGap": "Your repertoire has no answer to {played}",
  "repertoire.deviation.trainLine": "Train this line",
  "repertoire.deviation.addGap": "Add to repertoire",
  "repertoire.deviation.noBoard":
    "Mark a board as your White or Black repertoire from the board menu first.",
  "repertoire.deviation.gapAdded": "Opponent move added — now play your reply.",
  "repertoire.deviation.gapInvalid": "That move could not be added to the repertoire.",
  "repertoire.deviation.missingLine": "That line is no longer in the repertoire.",
};

const PT_BR: Record<RepertoireStringKey, string> = {
  "repertoire.mark.useWhite": "Usar como repertório de Brancas",
  "repertoire.mark.useBlack": "Usar como repertório de Pretas",
  "repertoire.mark.remove": "Remover marca de repertório",
  "repertoire.deviation.leftBadge": "Você saiu do repertório em {move}",
  "repertoire.deviation.gapBadge": "Novidade do adversário em {move}",
  "repertoire.deviation.lineEnded": "Linha encerrada",
  "repertoire.deviation.noRepertoireHint":
    "Marque um tabuleiro como seu repertório de Brancas ou Pretas no menu do tabuleiro para ver os desvios.",
  "repertoire.deviation.reviewUser": "Você saiu do repertório em {played}; sua linha é {repertoire}",
  "repertoire.deviation.reviewGap": "Seu repertório não tem resposta para {played}",
  "repertoire.deviation.trainLine": "Treinar esta linha",
  "repertoire.deviation.addGap": "Adicionar ao repertório",
  "repertoire.deviation.noBoard":
    "Marque um tabuleiro como seu repertório de Brancas ou Pretas no menu do tabuleiro primeiro.",
  "repertoire.deviation.gapAdded": "Lance do adversário adicionado — agora jogue sua resposta.",
  "repertoire.deviation.gapInvalid": "Esse lance não pôde ser adicionado ao repertório.",
  "repertoire.deviation.missingLine": "Essa linha não está mais no repertório.",
};

export const TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tRepertoire = createT(EN, PT_BR);
