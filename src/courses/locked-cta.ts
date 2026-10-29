// SIG-1119: locked-lesson call to action from the course tier and the
// signed-in state. Pure (no Supabase, no router): link targets are plain
// paths the views render.
import type { SiteLocale } from "@/src/i18n/locale";
import { tCourseAccess } from "@/src/i18n/course-access-strings";
import type { CourseAccessTier } from "./types";

export type LockedCtaKind = "signin" | "subscribe" | "buy";

export type LockedCta = {
  kind: LockedCtaKind;
  /** Link target: /login?next=…, /premium, or the course page #buy anchor. */
  href: string;
  /** Button label (already localized, price formatted when paid). */
  label: string;
};

function formatPrice(priceCents: number, locale: SiteLocale): string {
  const tag = locale === "pt-br" ? "pt-BR" : "en-US";
  return new Intl.NumberFormat(tag, { style: "currency", currency: "BRL" }).format(priceCents / 100);
}

export function lockedCta(input: {
  tier: CourseAccessTier;
  signedIn: boolean;
  /** Course page anchor target for paid courses (e.g. "/courses/slug#buy"). */
  courseHref: string;
  /** Current lesson path, appended as ?next= for anonymous visitors. */
  lessonPath: string;
  priceCents: number | null;
  locale: SiteLocale;
}): LockedCta {
  const { tier, signedIn, courseHref, lessonPath, priceCents, locale } = input;
  if (!signedIn) {
    return {
      kind: "signin",
      href: `/login?next=${encodeURIComponent(lessonPath)}`,
      label: tCourseAccess(locale, "course.access.signInToStudy"),
    };
  }
  if (tier === "premium") {
    return {
      kind: "subscribe",
      href: "/premium",
      label: tCourseAccess(locale, "course.access.subscribeToStudy"),
    };
  }
  if (tier === "paid") {
    return {
      kind: "buy",
      href: courseHref,
      label: tCourseAccess(
        locale,
        "course.access.buyToStudy",
        priceCents != null ? { price: formatPrice(priceCents, locale) } : { price: "" },
      ),
    };
  }
  // Free courses never lock for signed-in students; keep a sign-in-shaped
  // fallback so a miswired caller degrades to the lesson path.
  return {
    kind: "signin",
    href: lessonPath,
    label: tCourseAccess(locale, "course.access.signInToStudy"),
  };
}
