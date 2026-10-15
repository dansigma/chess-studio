// SIG-961: which language explanations are written in.
export const EXPLAIN_LOCALES = ["en", "pt-br"] as const;
export type ExplainLocale = (typeof EXPLAIN_LOCALES)[number];

export const DEFAULT_EXPLAIN_LOCALE: ExplainLocale = "en";

export const EXPLAIN_LOCALE_LABELS: Record<ExplainLocale, string> = {
  en: "English",
  "pt-br": "Português (Brasil)",
};

export function isExplainLocale(value: unknown): value is ExplainLocale {
  return typeof value === "string" && (EXPLAIN_LOCALES as readonly string[]).includes(value);
}

/** Picks a locale from a browser language tag such as `pt-BR`, `pt` or `en-US`. */
export function explainLocaleFromLanguage(language: string | undefined | null): ExplainLocale {
  return language?.toLowerCase().startsWith("pt") ? "pt-br" : DEFAULT_EXPLAIN_LOCALE;
}
