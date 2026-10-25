// SIG-1035: typed string-table helper. `createT(en, ptBr)` builds a
// `t(locale, key, vars?)` translator from two strict tables. Both tables are
// full `Record<Key, string>` (no `Partial`), so a missing PT-BR key fails
// `tsc` instead of silently falling back to English at runtime. `{name}`
// placeholders are replaced from `vars`; tokens with no matching var are
// left intact.
import type { SiteLocale } from "./locale";

export type StringVars = Record<string, string | number>;

export function createT<Key extends string>(
  en: Record<Key, string>,
  ptBr: Record<Key, string>,
): (locale: SiteLocale, key: Key, vars?: StringVars) => string {
  const tables: Record<SiteLocale, Record<Key, string>> = { en, "pt-br": ptBr };
  return (locale: SiteLocale, key: Key, vars?: StringVars): string => {
    const template = tables[locale][key];
    if (!vars) {
      return template;
    }
    return template.replace(/\{([^}]+)\}/g, (token, name: string) => {
      const value = vars[name];
      return value === undefined ? token : String(value);
    });
  };
}
