// SIG-1201: site navigation shared by the desktop activity bar; SIG-1202
// reuses the same href→icon mapping and active-path rule for the mobile
// Studio hamburger sheet. Labels/hrefs/order come from siteSections(locale)
// (SIG-1381: siteSections is the only source of order, so consumers never
// re-sort the site links).
import { GraduationCap, LayoutDashboard, Puzzle, type LucideIcon } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale";
import { siteSections } from "./sections";

export const SITE_NAV_ICONS: Record<string, LucideIcon> = {
  "/studio": LayoutDashboard,
  "/courses": GraduationCap,
  "/puzzles": Puzzle,
};

export function siteNavSections(locale: SiteLocale): Array<{ href: string; label: string }> {
  return siteSections(locale).filter((section) => SITE_NAV_ICONS[section.href]);
}

export function isActivePath(pathname: string | null, href: string): boolean {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}
