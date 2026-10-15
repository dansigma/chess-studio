// SIG-961: shape of a locale table. Statements are whole-sentence functions, so
// each language owns its agreement rules (gender, number, contractions) instead
// of gluing fragments together.
import type { EngineSummary, PieceType, SectionId, StatementId, StatementParams } from "../model";

export type RenderContext = {
  /** Formats a SAN move for display (the user's notation setting); identity when omitted. */
  formatSan?: (san: string) => string;
};

export type StatementTemplate<K extends StatementId> = (params: StatementParams[K], context: RenderContext) => string;

export type StatementTable = { [K in StatementId]: StatementTemplate<K> };

export const UI_KEYS = ["why", "bestLine", "engineOnly", "noLine"] as const;
export type UiKey = (typeof UI_KEYS)[number];

export type SummaryRenderer = (summary: EngineSummary, context: RenderContext) => string;

export type LocaleTable = {
  statements: StatementTable;
  sections: Record<SectionId, string>;
  ui: Record<UiKey, string>;
  summary: SummaryRenderer;
  pieceName: Record<PieceType, string>;
};

/** A translation may be incomplete; missing entries fall back to English. */
export type PartialLocaleTable = {
  statements: Partial<StatementTable>;
  sections: Partial<Record<SectionId, string>>;
  ui: Partial<Record<UiKey, string>>;
  summary?: SummaryRenderer;
  pieceName: Record<PieceType, string>;
};
