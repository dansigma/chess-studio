// SIG-1114: pure coach-authoring helpers. No I/O, no Next runtime — AdminView
// calls visibleActions for button policy, CourseFields uses the price helpers
// for the tier/price inputs, and the unit test in author-actions.test.ts pins
// the full matrix. Follows the status.ts grain (pure, separately tested).
import type { Role } from "@/src/lib/auth/roles";
import type { SiteLocale } from "@/src/i18n/locale";
import type { CourseAccessTier, CourseStatus } from "./types";

export type AuthorActionsInput = {
  role: Role | null | undefined;
  status: CourseStatus;
};

export type AuthorActions = {
  saveDraft: boolean;
  submitForReview: boolean;
  publish: boolean;
  unpublish: boolean;
  delete: boolean;
};

const NONE: AuthorActions = {
  saveDraft: false,
  submitForReview: false,
  publish: false,
  unpublish: false,
  delete: false,
};

/**
 * Button policy for the course admin screen.
 *
 * - Coach lists contain own courses only, so ownership is implied (no isOwner
 *   input): editable statuses (`draft`|`rejected`) get Save draft + Submit for
 *   review + Delete; `in_review` is read-only; `published`/`archived` show
 *   nothing.
 * - Admin: full publish workflow (save + publish everywhere, unpublish only
 *   from `published`, delete everywhere, never submit-for-review).
 * - Anyone else: nothing.
 */
export function visibleActions({ role, status }: AuthorActionsInput): AuthorActions {
  if (role === "coach") {
    if (status === "draft" || status === "rejected") {
      return { saveDraft: true, submitForReview: true, publish: false, unpublish: false, delete: true };
    }
    return { ...NONE };
  }
  if (role === "admin") {
    return {
      saveDraft: true,
      submitForReview: false,
      publish: true,
      unpublish: status === "published",
      delete: true,
    };
  }
  return { ...NONE };
}

/**
 * Parses a reais-denominated price string into integer BRL cents.
 *
 * - Trims whitespace; strips a leading `R$`.
 * - The LAST `.`/`,` is the decimal separator; earlier separators are
 *   thousands and must group exactly 3 digits (so `1.990` = 1990 cents =
 *   R$19,90, but `19.9,90` fails). With no separator the input is already
 *   cents (`1990` = 1990 cents), never reais.
 * - Max 2 decimals; fractions need 1–2 digits (`19,` and `19.999` fail).
 * - Returns null for empty, non-numeric, zero, negative, unsafe-integer, or
 *   otherwise malformed input.
 */
export function priceToCents(input: string): number | null {
  let text = input.trim();
  if (!text) {
    return null;
  }
  text = text.replace(/^[rR]\$\s*/, "");
  if (!text || /[eE]/.test(text)) {
    return null;
  }
  // Strip a single leading + (reject - via the digit check below).
  if (text.startsWith("+")) {
    text = text.slice(1).trim();
    if (!text) {
      return null;
    }
  }
  if (!/^[0-9][0-9.,\s]*$/.test(text)) {
    return null;
  }
  const compact = text.replace(/\s+/g, "");
  if (!compact || !/^[0-9][0-9.,]*$/.test(compact)) {
    return null;
  }
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);
  let whole: string;
  let frac: string;
  if (lastSep === -1) {
    whole = compact;
    frac = "";
  } else {
    whole = compact.slice(0, lastSep);
    frac = compact.slice(lastSep + 1);
    if (!/^\d{1,2}$/.test(frac)) {
      return null;
    }
    if (whole === "" || /[.,]/.test(whole)) {
      // Thousands groups before the decimal must be exactly 3 digits each:
      // the first group 1–3 digits, the rest exactly 3, single separator kind.
      if (whole === "") {
        whole = "0";
      } else {
        const groups = whole.split(/[.,]/);
        if (groups.length < 2) {
          return null;
        }
        const kinds = new Set(whole.replace(/[0-9]/g, "").split(""));
        if (kinds.size !== 1) {
          return null;
        }
        if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((group) => !/^\d{3}$/.test(group))) {
          return null;
        }
        whole = groups.join("");
      }
    } else if (!/^\d+$/.test(whole)) {
      return null;
    }
  }
  if (!/^\d+$/.test(whole)) {
    return null;
  }
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const wholeValue = Number(normalizedWhole === "" ? "0" : normalizedWhole);
  if (!Number.isSafeInteger(wholeValue)) {
    return null;
  }
  let fracValue = 0;
  if (frac !== "") {
    fracValue = Number.parseInt(frac.length === 1 ? `${frac}0` : frac, 10);
    if (!Number.isSafeInteger(fracValue)) {
      return null;
    }
  }
  const total = wholeValue * 100 + fracValue;
  if (!Number.isSafeInteger(total) || total <= 0) {
    return null;
  }
  // Plain digits without a separator are already cents (R$1990 would be
  // written `1990,00`), so `1990` = 1990 cents.
  if (lastSep === -1) {
    const raw = Number(compact.replace(/^0+(?=\d)/, "") || "0");
    if (!Number.isSafeInteger(raw) || raw <= 0) {
      return null;
    }
    return raw;
  }
  return total;
}

/** Formats integer BRL cents as a reais string: 1990 → "19.90" (en) / "19,90" (pt-br). */
export function centsToPrice(cents: number, locale: SiteLocale): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new RangeError("centsToPrice needs a positive integer");
  }
  const whole = Math.trunc(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return locale === "pt-br" ? `${groupThousands(whole, ".")},${frac}` : `${groupThousands(whole, ",")}.${frac}`;
}

function groupThousands(value: number, sep: string): string {
  return value
    .toString()
    .split("")
    .reverse()
    .reduce<string[]>((parts, digit, index) => {
      if (index > 0 && index % 3 === 0) {
        parts.push(sep);
      }
      parts.push(digit);
      return parts;
    }, [])
    .reverse()
    .join("");
}

export type TierPriceCheck = { ok: true } | { ok: false; error: "course.admin.error.invalidPrice" };

/**
 * Tier/price invariant (mirrors the DB `courses_paid_price_check`): `paid`
 * requires positive-integer cents, non-`paid` requires null.
 */
export function validateTierAndPrice(tier: CourseAccessTier, priceCents: number | null): TierPriceCheck {
  if (tier === "paid") {
    if (priceCents == null || !Number.isInteger(priceCents) || priceCents <= 0) {
      return { ok: false, error: "course.admin.error.invalidPrice" };
    }
    return { ok: true };
  }
  if (priceCents !== null) {
    return { ok: false, error: "course.admin.error.invalidPrice" };
  }
  return { ok: true };
}
