// SIG-962: canonical site language. `en` | `pt-br` is shared by the site
// chrome (nav, selector, <html lang>) and Game Review explanations; see
// src/chess/explain/locale.ts which re-exports this module.
export const SITE_LOCALES = ["en", "pt-br"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

export const DEFAULT_SITE_LOCALE: SiteLocale = "en";

export const SITE_LOCALE_LABELS: Record<SiteLocale, string> = {
  en: "English",
  "pt-br": "Português (Brasil)",
};

export function isSiteLocale(value: unknown): value is SiteLocale {
  return typeof value === "string" && (SITE_LOCALES as readonly string[]).includes(value);
}

/** Picks a locale from a browser language tag such as `pt-BR`, `pt` or `en-US`. */
export function siteLocaleFromLanguage(language: string | undefined | null): SiteLocale {
  return language?.toLowerCase().startsWith("pt") ? "pt-br" : DEFAULT_SITE_LOCALE;
}

/** BCP-47 tag for <html lang>: `pt-br` → `pt-BR`, else `en`. */
export function htmlLangFor(locale: SiteLocale): string {
  return locale === "pt-br" ? "pt-BR" : "en";
}

export const LANG_BOOTSTRAP = `(function(){try{var lang="en";var raw=localStorage.getItem("studio-clone-settings");if(raw){var parsed=JSON.parse(raw);if(parsed&&(parsed.locale==="en"||parsed.locale==="pt-br")){lang=parsed.locale==="pt-br"?"pt-BR":"en";}}document.documentElement.lang=lang;}catch(e){}})();`;
