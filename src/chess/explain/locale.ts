// SIG-961: which language explanations are written in. Canonical definition
// lives in src/i18n/locale.ts (SIG-962 site language); this module re-exports
// it so explain code keeps working unchanged.
export {
  DEFAULT_SITE_LOCALE as DEFAULT_EXPLAIN_LOCALE,
  SITE_LOCALE_LABELS as EXPLAIN_LOCALE_LABELS,
  SITE_LOCALES as EXPLAIN_LOCALES,
  htmlLangFor as explainHtmlLangFor,
  isSiteLocale as isExplainLocale,
  siteLocaleFromLanguage as explainLocaleFromLanguage,
  type SiteLocale as ExplainLocale,
} from "@/src/i18n/locale";
