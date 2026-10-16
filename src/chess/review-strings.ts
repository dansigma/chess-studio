// SIG-963: Game Review panel + report card strings. Pure-model EN/PT-BR tables
// with English fallback (same grain as src/i18n/strings.ts and
// src/chess/explain/render.ts). Interpolated sentences are whole-sentence
// template functions so PT-BR word order never comes from concatenation.
import type { SiteLocale } from "../i18n/locale.ts";
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
  "report.whiteFallback",
  "report.blackFallback",
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
  "report.whiteFallback": "White",
  "report.blackFallback": "Black",
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
  "report.whiteFallback": "Brancas",
  "report.blackFallback": "Pretas",
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

/** "~12s left" / "faltam ~12s"; "~2m 5s left" / "faltam ~2min 5s". Owns the seconds math. */
export function formatReviewEta(locale: SiteLocale, ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) {
    return locale === "pt-br" ? `faltam ~${seconds}s` : `~${seconds}s left`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return locale === "pt-br" ? `faltam ~${minutes}min ${rest}s` : `~${minutes}m ${rest}s left`;
}

/** "Scoring moves at depth 12… 3/20" / "Avaliando lances na profundidade 12… 3/20". */
export function reviewProgressText(
  locale: SiteLocale,
  args: { depth: number; done: number; total: number },
): string {
  return locale === "pt-br"
    ? `Avaliando lances na profundidade ${args.depth}… ${args.done}/${args.total}`
    : `Scoring moves at depth ${args.depth}… ${args.done}/${args.total}`;
}

/** "The engine stopped responding at 3/20 positions. Try the review again." + PT-BR. */
export function reviewFailedText(locale: SiteLocale, args: { done: number; total: number }): string {
  return locale === "pt-br"
    ? `O motor parou de responder em ${args.done}/${args.total} posições. Tente a análise novamente.`
    : `The engine stopped responding at ${args.done}/${args.total} positions. Try the review again.`;
}

/** "Review cancelled at 3/20 positions." + PT-BR. */
export function reviewCancelledText(locale: SiteLocale, args: { done: number; total: number }): string {
  return locale === "pt-br"
    ? `Análise cancelada em ${args.done}/${args.total} posições.`
    : `Review cancelled at ${args.done}/${args.total} positions.`;
}

/** "Resume review 3/20" / "Retomar análise 3/20" — primary resume affordance with progress. */
export function reviewResumeText(locale: SiteLocale, args: { done: number; total: number }): string {
  return locale === "pt-br"
    ? `Retomar análise ${args.done}/${args.total}`
    : `Resume review ${args.done}/${args.total}`;
}

/** "White"/"Black" / "Brancas"/"Pretas" — fallback when the PGN header has no player name. */
export function reviewPlayerFallback(locale: SiteLocale, side: "w" | "b"): string {
  return tReview(locale, side === "w" ? "report.whiteFallback" : "report.blackFallback");
}
