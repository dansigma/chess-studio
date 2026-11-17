import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isActivePath, SITE_NAV_ICONS, siteNavSections } from "./nav.ts";
import { siteSections } from "./sections.ts";

// SIG-1202: the mobile Studio sheet shares the desktop activity bar's site
// navigation, so the href→icon map and active-path rule live here once.
describe("site nav (SIG-1202)", () => {
  it("keeps siteSections order and covers every site section", () => {
    assert.deepEqual(
      siteNavSections("en").map((section) => section.href),
      siteSections("en").map((section) => section.href),
    );
    for (const section of siteSections("en")) {
      assert.ok(SITE_NAV_ICONS[section.href], `icon for ${section.href}`);
    }
  });

  it("localizes labels through siteSections", () => {
    assert.deepEqual(siteNavSections("pt-br").map((section) => section.label), [
      "Cursos",
      "Exercícios",
      "Studio",
    ]);
  });

  it("matches the path exactly or by prefix", () => {
    assert.equal(isActivePath("/courses", "/courses"), true);
    assert.equal(isActivePath("/courses/abc", "/courses"), true);
    assert.equal(isActivePath("/courseships", "/courses"), false);
    assert.equal(isActivePath("/studio", "/courses"), false);
    assert.equal(isActivePath(null, "/studio"), false);
  });
});
