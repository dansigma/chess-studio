// SIG-961: the only place statements become sentences. Looks each statement up
// in the active locale table and falls back to English when a translation is
// missing (logging it outside production so the gap gets noticed).
import type { ExplainLocale } from "./locale";
import type { Explanation, EngineSummary, SectionId, Statement, StatementId } from "./model";
import { EN } from "./locales/en";
import { PT_BR } from "./locales/pt-br";
import type { PartialLocaleTable, RenderContext, StatementTemplate, UiKey } from "./locales/types";

const TABLES: Record<ExplainLocale, PartialLocaleTable> = { en: EN, "pt-br": PT_BR };

function warnMissing(locale: ExplainLocale, what: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[explain] missing ${locale} text for "${what}", using English`);
  }
}

export function renderStatement(locale: ExplainLocale, statement: Statement, context: RenderContext = {}): string {
  const template = TABLES[locale].statements[statement.id] as StatementTemplate<StatementId> | undefined;
  if (template) {
    return template(statement.params as never, context);
  }
  warnMissing(locale, statement.id);
  return (EN.statements[statement.id] as StatementTemplate<StatementId>)(statement.params as never, context);
}

export function sectionTitle(locale: ExplainLocale, id: SectionId): string {
  const title = TABLES[locale].sections[id];
  if (title !== undefined) {
    return title;
  }
  warnMissing(locale, `section:${id}`);
  return EN.sections[id];
}

export function uiText(locale: ExplainLocale, key: UiKey): string {
  const text = TABLES[locale].ui[key];
  if (text !== undefined) {
    return text;
  }
  warnMissing(locale, `ui:${key}`);
  return EN.ui[key];
}

export function renderSummary(locale: ExplainLocale, summary: EngineSummary, context: RenderContext = {}): string {
  const renderer = TABLES[locale].summary;
  if (renderer) {
    return renderer(summary, context);
  }
  warnMissing(locale, "summary");
  return EN.summary(summary, context);
}

export type RenderedExplanation = {
  summary: string;
  confident: boolean;
  sections: Array<{
    id: SectionId;
    title: string;
    items: Array<{ text: string; statement: Statement }>;
  }>;
};

export function renderExplanation(locale: ExplainLocale, explanation: Explanation, context: RenderContext = {}): RenderedExplanation {
  return {
    summary: renderSummary(locale, explanation.summary, context),
    confident: explanation.confident,
    sections: explanation.sections.map((section) => ({
      id: section.id,
      title: sectionTitle(locale, section.id),
      items: section.statements.map((statement) => ({ text: renderStatement(locale, statement, context), statement })),
    })),
  };
}
