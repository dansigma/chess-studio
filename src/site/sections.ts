// SIG-867: English is the canonical locale; SITE_SECTIONS stays English so the
// EN pin in sections.test.ts holds. SIG-962 adds siteSections(locale) for
// localized chrome; SITE_NAME is a proper noun and stays untranslated.
import type { SiteLocale } from "@/src/i18n/locale";
import { t } from "@/src/i18n/strings";

export const SITE_NAME = "Xadrez Digital" as const;

export const SITE_SECTIONS = [
  { href: "/courses", label: "Courses" },
  { href: "/puzzles", label: "Puzzles" },
  { href: "/studio", label: "Studio" },
] as const;

export function siteSections(locale: SiteLocale): Array<{ href: string; label: string }> {
  if (locale === "en") {
    return SITE_SECTIONS.map((section) => ({ ...section }));
  }
  return [
    { href: "/courses", label: t(locale, "nav.courses") },
    { href: "/puzzles", label: t(locale, "nav.puzzles") },
    { href: "/studio", label: t(locale, "nav.studio") },
  ];
}
