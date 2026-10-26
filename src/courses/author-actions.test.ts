// SIG-1114: pins the coach-authoring button policy and the tier/price
// helpers. Mirrors the status.test.ts grain (node:test + assert/strict,
// full role x status matrix).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { centsToPrice, priceToCents, validateTierAndPrice, visibleActions } from "./author-actions.ts";
import type { Role } from "@/src/lib/auth/roles.ts";
import type { CourseAccessTier, CourseStatus } from "./types.ts";

const STATUSES: CourseStatus[] = ["draft", "in_review", "published", "rejected", "archived"];
const ROLES: Array<Role | null | undefined> = ["admin", "coach", "student", null, undefined];

describe("visibleActions matrix", () => {
  it("matches the explicit allow-set for every role x status", () => {
    const expected = (role: Role | null | undefined, status: CourseStatus) => {
      if (role === "coach") {
        const editable = status === "draft" || status === "rejected";
        return {
          saveDraft: editable,
          submitForReview: editable,
          publish: false,
          unpublish: false,
          delete: editable,
        };
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
      return { saveDraft: false, submitForReview: false, publish: false, unpublish: false, delete: false };
    };
    for (const role of ROLES) {
      for (const status of STATUSES) {
        assert.deepEqual(visibleActions({ role, status }), expected(role, status), `${role}:${status}`);
      }
    }
  });

  it("never lets a coach publish or unpublish", () => {
    for (const status of STATUSES) {
      const actions = visibleActions({ role: "coach", status });
      assert.equal(actions.publish, false, status);
      assert.equal(actions.unpublish, false, status);
    }
  });

  it("lets an admin publish everywhere and unpublish only from published", () => {
    for (const status of STATUSES) {
      const actions = visibleActions({ role: "admin", status });
      assert.equal(actions.publish, true, status);
      assert.equal(actions.unpublish, status === "published", status);
      assert.equal(actions.submitForReview, false, status);
    }
  });
});

describe("priceToCents", () => {
  it("parses reais strings with either decimal separator", () => {
    assert.equal(priceToCents("19,90"), 1990);
    assert.equal(priceToCents("19.90"), 1990);
    assert.equal(priceToCents("19,9"), 1990);
    assert.equal(priceToCents("19.9"), 1990);
    assert.equal(priceToCents("0,99"), 99);
    assert.equal(priceToCents(" 19,90 "), 1990);
    assert.equal(priceToCents("R$ 19,90"), 1990);
    assert.equal(priceToCents("1.990,00"), 199000);
    assert.equal(priceToCents("1,990.00"), 199000);
  });

  it("treats separator-less digits as cents, not reais", () => {
    assert.equal(priceToCents("1990"), 1990);
    assert.equal(priceToCents("99"), 99);
  });

  it("rejects empty, non-numeric, zero, and negative input", () => {
    for (const input of ["", "   ", "abc", "0", "0,00", "0.00", "-5", "-1,00", "R$", "+", "1e3", "--5"]) {
      assert.equal(priceToCents(input), null, JSON.stringify(input));
    }
  });

  it("rejects malformed decimals and bad thousands groups", () => {
    for (const input of ["19,", "19.999", "19,999", "19.9,90", "1.99.0,00", "12.34.56", ",90", "19, 90x"]) {
      assert.equal(priceToCents(input), null, JSON.stringify(input));
    }
  });
});

describe("centsToPrice", () => {
  it("formats with the locale decimal separator", () => {
    assert.equal(centsToPrice(1990, "en"), "19.90");
    assert.equal(centsToPrice(1990, "pt-br"), "19,90");
    assert.equal(centsToPrice(99, "pt-br"), "0,99");
    assert.equal(centsToPrice(199000, "pt-br"), "1.990,00");
    assert.equal(centsToPrice(199000, "en"), "1,990.00");
  });

  it("rejects non-positive or non-integer input", () => {
    for (const cents of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => centsToPrice(cents, "en"), RangeError, String(cents));
    }
  });

  it("round-trips priceToCents output", () => {
    for (const input of ["19,90", "19.9", "0,99", "1.990,00"]) {
      const cents = priceToCents(input);
      assert.ok(cents !== null, input);
      assert.equal(priceToCents(centsToPrice(cents, "pt-br")), cents, input);
      assert.equal(priceToCents(centsToPrice(cents, "en")), cents, input);
    }
  });
});

describe("validateTierAndPrice", () => {
  it("requires positive-integer cents exactly for paid", () => {
    assert.deepEqual(validateTierAndPrice("paid", 1990), { ok: true });
    for (const cents of [null, 0, -1, 1.5]) {
      assert.deepEqual(validateTierAndPrice("paid", cents), { ok: false, error: "course.admin.error.invalidPrice" }, String(cents));
    }
  });

  it("rejects any price on non-paid tiers", () => {
    for (const tier of ["free", "premium"] as const satisfies CourseAccessTier[]) {
      assert.deepEqual(validateTierAndPrice(tier, null), { ok: true }, tier);
      assert.deepEqual(
        validateTierAndPrice(tier, 1990),
        { ok: false, error: "course.admin.error.invalidPrice" },
        `${tier} with price`,
      );
    }
  });
});
