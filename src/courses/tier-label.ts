// SIG-1115: pure access-tier badge label. No React, no I/O — the catalog
// cards and the course header render this string inside TierBadge. Price
// formatting reuses centsToPrice (BRL; both locales use the R$ prefix
// because currency is DB-constrained to BRL), locale only changes the
// grouping/decimal separators.
import type { SiteLocale } from "@/src/i18n/locale";
import { tCourse } from "@/src/i18n/course-strings";
import { centsToPrice } from "./author-actions";
import type { CourseAccessTier } from "./types";

/** Badge text for a course's access tier. Throws on paid without a valid price. */
export function tierLabel(tier: CourseAccessTier, priceCents: number | null, locale: SiteLocale): string {
  if (tier === "free") {
    return tCourse(locale, "course.tier.free");
  }
  if (tier === "premium") {
    return tCourse(locale, "course.tier.premium");
  }
  if (priceCents == null) {
    throw new RangeError("tierLabel needs a price for paid courses");
  }
  return tCourse(locale, "course.tier.price", { price: centsToPrice(priceCents, locale) });
}
