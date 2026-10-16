// SIG-963: Game Review panel + report card strings. Pure-model EN/PT-BR tables
// with English fallback (same grain as src/i18n/strings.ts and
// src/chess/explain/render.ts). Interpolated sentences are whole-sentence
// template functions so PT-BR word order never comes from concatenation.
import type { SiteLocale } from "../i18n/locale.ts";
import { formatInteger } from "../i18n/format.ts";
import type { GamePhase } from "./phases.ts";
import type { ReviewLabel } from "./review.ts";
import type { ReviewPreset } from "./review-engine.ts";

export const REVIEW_STRING_KEYS = [
  "panel.title",
  "panel.depthLabel",
  "panel.progressLabel",
  "panel.cancel",
  "panel.reviewAgain",
  "panel.reviewGame",
  "panel.resumeReview",
  "panel.partialNote",
  "panel.savedReview",
  "panel.empty",
  "panel.pausedSetup",
  "panel.estimating",
  "panel.lineNote",
  "report.accuracy",
  "report.avgLoss",
  "report.avgLossTitle",
  "report.gameRating",
  "report.ratingTooltip",
  "report.forcedTooltip",
  "report.keyMoments",
  "report.noMistakes",
  "report.noFilteredMoments",
  "report.whiteFallback",
  "report.blackFallback",
  "chart.title",
  "chart.empty",
  "chart.ariaLabel",
  "chart.start",
  "chart.ply",
  "chart.mate",
  "chart.summary",
  "filter.side",
  "filter.sideBoth",
  "filter.sideWhite",
  "filter.sideBlack",
  "filter.tierGroup",
  "filter.tierAll",
  "filter.tierBrilliant",
  "filter.tierMistakes",
  "filter.tierMisses",
  "filter.tierBlunders",
  "moments.prev",
  "moments.next",
  "phase.opening",
  "phase.middlegame",
  "phase.endgame",
  "tier.brilliant",
  "tier.great",
  "tier.best",
  "tier.veryGood",
  "tier.decent",
  "tier.book",
  "tier.inaccuracy",
  "tier.mistake",
  "tier.miss",
  "tier.blunder",
  "tier.forced",
  "annotate.bestWas",
  "annotate.title",
  "annotate.confirm",
  "annotate.evals",
  "annotate.bestMove",
  "annotate.keyMomentsOnly",
  "annotate.undo",
  "annotate.done",
  "annotate.undone",
  "annotate.upToDate",
  "share.title",
  "share.copyImage",
  "share.downloadImage",
  "share.copySummary",
  "share.copied",
  "share.copyFailed",
  "share.imageCopied",
  "share.imageDownloaded",
  "share.imageFailed",
  "share.summaryTitle",
  "preset.fast",
  "preset.standard",
  "preset.deep",
] as const;

export type ReviewStringKey = (typeof REVIEW_STRING_KEYS)[number];

const EN: Record<ReviewStringKey, string> = {
  "panel.title": "Game Review",
  "panel.depthLabel": "Review depth",
  "panel.progressLabel": "Review progress",
  "panel.cancel": "Cancel",
  "panel.reviewAgain": "Review again",
  "panel.reviewGame": "Review game",
  "panel.resumeReview": "Resume review",
  "panel.partialNote": "Partial review — resume to complete.",
  "panel.savedReview": "Saved review",
  "panel.empty": "Play or open a game to review it.",
  "panel.pausedSetup": "Paused in setup.",
  "panel.estimating": "estimating…",
  "panel.lineNote": "Reviewed line is a variation, not the main line.",
  "report.accuracy": "Accuracy",
  "report.avgLoss": "Avg. loss",
  "report.avgLossTitle": "Average centipawn loss per move (lower is better)",
  "report.gameRating": "Game rating ⓘ",
  "report.ratingTooltip":
    "Estimated from each player's average centipawn loss (book and forced moves excluded). " +
    "When the game header has a rating, the estimate is scaled around it; a leading ≈ means the " +
    "player has no header rating, so the number is a raw estimate. It is not an official rating.",
  "report.forcedTooltip":
    "Moves with only one legal reply; left out of accuracy, average loss and the tiers above",
  "report.keyMoments": "Key moments",
  "report.noMistakes": "No mistakes in this line.",
  "report.noFilteredMoments": "No key moments match these filters.",
  "report.whiteFallback": "White",
  "report.blackFallback": "Black",
  "chart.title": "Evaluation",
  "chart.empty": "Finish the review to plot the evaluation.",
  "chart.ariaLabel": "Review evaluation chart",
  "chart.start": "Start",
  "chart.ply": "Ply {ply}",
  "chart.mate": "mate",
  "chart.summary": "Review chart: {plies} plies, {moments} key moments",
  "filter.side": "Side",
  "filter.sideBoth": "Both",
  "filter.sideWhite": "White",
  "filter.sideBlack": "Black",
  "filter.tierGroup": "Moments",
  "filter.tierAll": "All",
  "filter.tierBrilliant": "Brilliant",
  "filter.tierMistakes": "Mistakes",
  "filter.tierMisses": "Misses",
  "filter.tierBlunders": "Blunders",
  "moments.prev": "Previous moment",
  "moments.next": "Next moment",
  "phase.opening": "Opening",
  "phase.middlegame": "Middlegame",
  "phase.endgame": "Endgame",
  "tier.brilliant": "Genius",
  "tier.great": "Great",
  "tier.best": "Perfect",
  "tier.veryGood": "Very good",
  "tier.decent": "Decent",
  "tier.book": "Textbook",
  "tier.inaccuracy": "Imprecise",
  "tier.mistake": "Mistake",
  "tier.miss": "Miss",
  "tier.blunder": "Blunder",
  "tier.forced": "Forced",
  "annotate.bestWas": "Best was {san}.",
  "annotate.title": "Annotate game",
  "annotate.confirm": "Annotate",
  "annotate.evals": "Include evaluations",
  "annotate.bestMove": "Include best-move notes",
  "annotate.keyMomentsOnly": "Only key moments",
  "annotate.undo": "Undo annotations",
  "annotate.done": "Annotations added to the game.",
  "annotate.undone": "Annotations removed.",
  "annotate.upToDate": "Annotations are already up to date.",
  "share.title": "Share",
  "share.copyImage": "Copy report image",
  "share.downloadImage": "Download report image",
  "share.copySummary": "Copy summary",
  "share.copied": "Summary copied to clipboard.",
  "share.copyFailed": "Could not copy the summary.",
  "share.imageCopied": "Report image copied.",
  "share.imageDownloaded": "Report image downloaded.",
  "share.imageFailed": "Could not copy the report image.",
  "share.summaryTitle": "Game review",
  "preset.fast": "Fast",
  "preset.standard": "Standard",
  "preset.deep": "Deep",
};

const PT_BR: Record<ReviewStringKey, string> = {
  "panel.title": "Análise da partida",
  "panel.depthLabel": "Profundidade da análise",
  "panel.progressLabel": "Progresso da análise",
  "panel.cancel": "Cancelar",
  "panel.reviewAgain": "Analisar novamente",
  "panel.reviewGame": "Analisar partida",
  "panel.resumeReview": "Retomar análise",
  "panel.partialNote": "Análise parcial — retome para concluir.",
  "panel.savedReview": "Análise salva",
  "panel.empty": "Jogue ou abra uma partida para analisá-la.",
  "panel.pausedSetup": "Pausado na configuração.",
  "panel.estimating": "estimando…",
  "panel.lineNote": "A linha analisada é uma variante, não a linha principal.",
  "report.accuracy": "Precisão",
  "report.avgLoss": "Perda média",
  "report.avgLossTitle": "Perda média em centipeões por lance (quanto menor, melhor)",
  "report.gameRating": "Rating da partida ⓘ",
  "report.ratingTooltip":
    "Estimado a partir da perda média em centipeões de cada jogador (lances de livro e forçados excluídos). " +
    "Quando o cabeçalho da partida tem um rating, a estimativa é ajustada em torno dele; um ≈ inicial significa que o " +
    "jogador não tem rating no cabeçalho, então o número é uma estimativa bruta. Não é um rating oficial.",
  "report.forcedTooltip":
    "Lances com apenas uma resposta legal; excluídos da precisão, da perda média e das faixas acima",
  "report.keyMoments": "Momentos-chave",
  "report.noMistakes": "Sem erros nesta linha.",
  "report.noFilteredMoments": "Nenhum momento-chave com estes filtros.",
  "report.whiteFallback": "Brancas",
  "report.blackFallback": "Pretas",
  "chart.title": "Avaliação",
  "chart.empty": "Conclua a análise para ver o gráfico.",
  "chart.ariaLabel": "Gráfico da análise",
  "chart.start": "Início",
  "chart.ply": "Lance {ply}",
  "chart.mate": "mate",
  "chart.summary": "Gráfico da análise: {plies} lances, {moments} momentos-chave",
  "filter.side": "Lado",
  "filter.sideBoth": "Ambos",
  "filter.sideWhite": "Brancas",
  "filter.sideBlack": "Pretas",
  "filter.tierGroup": "Momentos",
  "filter.tierAll": "Todos",
  "filter.tierBrilliant": "Geniais",
  "filter.tierMistakes": "Erros",
  "filter.tierMisses": "Perdas",
  "filter.tierBlunders": "Capivaradas",
  "moments.prev": "Momento anterior",
  "moments.next": "Próximo momento",
  "phase.opening": "Abertura",
  "phase.middlegame": "Meio-jogo",
  "phase.endgame": "Final",
  "tier.brilliant": "Genial",
  "tier.great": "Ótimo",
  "tier.best": "Perfeito",
  "tier.veryGood": "Muito bom",
  "tier.decent": "Razoável",
  "tier.book": "Teórico",
  "tier.inaccuracy": "Imprecisão",
  "tier.mistake": "Erro",
  "tier.miss": "Perda",
  "tier.blunder": "Capivarada",
  "tier.forced": "Forçado",
  "annotate.bestWas": "Melhor era {san}.",
  "annotate.title": "Anotar partida",
  "annotate.confirm": "Anotar",
  "annotate.evals": "Incluir avaliações",
  "annotate.bestMove": "Incluir notas de melhor lance",
  "annotate.keyMomentsOnly": "Somente momentos-chave",
  "annotate.undo": "Desfazer anotações",
  "annotate.done": "Anotações adicionadas à partida.",
  "annotate.undone": "Anotações removidas.",
  "annotate.upToDate": "As anotações já estão atualizadas.",
  "share.title": "Compartilhar",
  "share.copyImage": "Copiar imagem do relatório",
  "share.downloadImage": "Baixar imagem do relatório",
  "share.copySummary": "Copiar resumo",
  "share.copied": "Resumo copiado.",
  "share.copyFailed": "Não foi possível copiar o resumo.",
  "share.imageCopied": "Imagem do relatório copiada.",
  "share.imageDownloaded": "Imagem do relatório baixada.",
  "share.imageFailed": "Não foi possível copiar a imagem do relatório.",
  "share.summaryTitle": "Análise da partida",
  "preset.fast": "Rápida",
  "preset.standard": "Padrão",
  "preset.deep": "Profunda",
};

export const TABLES: Record<SiteLocale, Partial<Record<ReviewStringKey, string>>> = {
  en: EN,
  "pt-br": PT_BR,
};

function warnMissing(locale: SiteLocale, key: ReviewStringKey): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[review-strings] missing ${locale} text for "${key}", using English`);
  }
}

/** Looks up a review UI string, falling back to English when the locale lacks it. */
export function tReview(locale: SiteLocale, key: ReviewStringKey): string {
  const text = TABLES[locale]?.[key];
  if (text !== undefined) {
    return text;
  }
  warnMissing(locale, key);
  return EN[key];
}

const TIER_KEYS: Record<ReviewLabel, ReviewStringKey> = {
  brilliant: "tier.brilliant",
  great: "tier.great",
  best: "tier.best",
  veryGood: "tier.veryGood",
  decent: "tier.decent",
  book: "tier.book",
  inaccuracy: "tier.inaccuracy",
  mistake: "tier.mistake",
  miss: "tier.miss",
  blunder: "tier.blunder",
  forced: "tier.forced",
};

/** Display name of a review tier (e.g. "Mistake" / "Erro"). Marks, icons and classNames stay in REVIEW_TIERS. */
export function tierName(locale: SiteLocale, label: ReviewLabel): string {
  return tReview(locale, TIER_KEYS[label]);
}

const PHASE_KEYS: Record<GamePhase, ReviewStringKey> = {
  opening: "phase.opening",
  middlegame: "phase.middlegame",
  endgame: "phase.endgame",
};

/** Display name of a game phase (e.g. "Middlegame" / "Meio-jogo"). */
export function phaseName(locale: SiteLocale, phase: GamePhase): string {
  return tReview(locale, PHASE_KEYS[phase]);
}

const PRESET_KEYS: Record<ReviewPreset, ReviewStringKey> = {
  fast: "preset.fast",
  standard: "preset.standard",
  deep: "preset.deep",
};

/** Display label of a review preset (e.g. "Fast" / "Rápida"). Depth stays in REVIEW_PRESETS. */
export function presetLabel(locale: SiteLocale, preset: ReviewPreset): string {
  return tReview(locale, PRESET_KEYS[preset]);
}

/** "Fast (depth 10)" / "Rápida (profundidade 10)" — whole-sentence template, never concatenation. */
export function reviewPresetOption(locale: SiteLocale, preset: ReviewPreset, depth: number): string {
  const label = presetLabel(locale, preset);
  return locale === "pt-br" ? `${label} (profundidade ${depth})` : `${label} (depth ${depth})`;
}

/** "~12s left" / "~12s restantes"; "~2m 05s left" / "~2m 05s restantes". Owns the seconds math. */
export function formatReviewEta(locale: SiteLocale, ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) {
    return locale === "pt-br" ? `~${seconds}s restantes` : `~${seconds}s left`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return locale === "pt-br" ? `~${minutes}m ${rest}s restantes` : `~${minutes}m ${rest}s left`;
}

/** "Scoring moves at depth 12… 3/20" / "Avaliando lances na profundidade 12… 3/20". */
export function reviewProgressText(
  locale: SiteLocale,
  args: { depth: number; done: number; total: number },
): string {
  const depth = formatInteger(locale, args.depth);
  const done = formatInteger(locale, args.done);
  const total = formatInteger(locale, args.total);
  return locale === "pt-br"
    ? `Avaliando lances na profundidade ${depth}… ${done}/${total}`
    : `Scoring moves at depth ${depth}… ${done}/${total}`;
}

/** "The engine stopped responding at 3/20 positions. Try the review again." + PT-BR. */
export function reviewFailedText(locale: SiteLocale, args: { done: number; total: number }): string {
  const done = formatInteger(locale, args.done);
  const total = formatInteger(locale, args.total);
  return locale === "pt-br"
    ? `O motor parou de responder em ${done}/${total} posições. Tente a análise novamente.`
    : `The engine stopped responding at ${done}/${total} positions. Try the review again.`;
}

/** "Review cancelled at 3/20 positions." + PT-BR. */
export function reviewCancelledText(locale: SiteLocale, args: { done: number; total: number }): string {
  const done = formatInteger(locale, args.done);
  const total = formatInteger(locale, args.total);
  return locale === "pt-br"
    ? `Análise cancelada em ${done}/${total} posições.`
    : `Review cancelled at ${done}/${total} positions.`;
}

/** "Resume review 3/20" / "Retomar análise 3/20" — primary resume affordance with progress. */
export function reviewResumeText(locale: SiteLocale, args: { done: number; total: number }): string {
  const done = formatInteger(locale, args.done);
  const total = formatInteger(locale, args.total);
  return locale === "pt-br" ? `Retomar análise ${done}/${total}` : `Resume review ${done}/${total}`;
}

/** "White"/"Black" / "Brancas"/"Pretas" — fallback when the PGN header has no player name. */
export function reviewPlayerFallback(locale: SiteLocale, side: "w" | "b"): string {
  return tReview(locale, side === "w" ? "report.whiteFallback" : "report.blackFallback");
}
