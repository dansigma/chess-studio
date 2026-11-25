import { tLive, type LiveStringKey } from "@/src/i18n/live-strings";
import type { SiteLocale } from "@/src/i18n/locale";

const SECTION_KEYS = new Map<string, LiveStringKey>([
  ["open", "live.section.open"],
  ["girls", "live.section.women"],
  ["women", "live.section.women"],
]);

export function sectionLabel(name: string, locale: SiteLocale): string {
  if (locale === "en") {
    return name;
  }
  const key = SECTION_KEYS.get(name.trim().toLowerCase());
  return key ? tLive(locale, key) : name;
}
