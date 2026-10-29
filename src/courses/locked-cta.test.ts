import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lockedCta } from "./locked-cta.ts";

describe("lockedCta", () => {
  it("points anonymous visitors at sign-in with the lesson as next", () => {
    const cta = lockedCta({
      tier: "premium",
      signedIn: false,
      courseHref: "/courses/openings#buy",
      lessonPath: "/courses/openings/line-a",
      priceCents: null,
      locale: "en",
    });
    assert.equal(cta.kind, "signin");
    assert.equal(cta.href, "/login?next=%2Fcourses%2Fopenings%2Fline-a");
    assert.equal(cta.label, "Sign in");
  });

  it("points signed-in students without a subscription at /premium", () => {
    for (const locale of ["en", "pt-br"] as const) {
      const cta = lockedCta({
        tier: "premium",
        signedIn: true,
        courseHref: "/courses/openings#buy",
        lessonPath: "/courses/openings/line-a",
        priceCents: null,
        locale,
      });
      assert.equal(cta.kind, "subscribe");
      assert.equal(cta.href, "/premium");
      assert.equal(cta.label, locale === "en" ? "Subscribe" : "Assinar");
    }
  });

  it("points buyers at the course #buy anchor with the formatted price", () => {
    const en = lockedCta({
      tier: "paid",
      signedIn: true,
      courseHref: "/courses/caro#buy",
      lessonPath: "/courses/caro/line-a",
      priceCents: 1990,
      locale: "en",
    });
    assert.equal(en.kind, "buy");
    assert.equal(en.href, "/courses/caro#buy");
    assert.ok(en.label.includes("19.90"), `unexpected en label: ${en.label}`);
    const pt = lockedCta({
      tier: "paid",
      signedIn: true,
      courseHref: "/courses/caro#buy",
      lessonPath: "/courses/caro/line-a",
      priceCents: 1990,
      locale: "pt-br",
    });
    assert.equal(pt.kind, "buy");
    assert.ok(pt.label.includes("19,90"), `unexpected pt label: ${pt.label}`);
  });

  it("sends anonymous visitors on non-free courses to sign-in", () => {
    const cta = lockedCta({
      tier: "paid",
      signedIn: false,
      courseHref: "/courses/caro#buy",
      lessonPath: "/courses/caro/line-a",
      priceCents: 1990,
      locale: "pt-br",
    });
    assert.equal(cta.kind, "signin");
    assert.ok(cta.href.startsWith("/login?next="));
  });
});
