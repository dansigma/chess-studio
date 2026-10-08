import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SITE_NAME, SITE_SECTIONS } from "./sections.ts";

// SIG-867: English is the canonical locale; the PT-brand/EN-UI mix was
// drift, not i18n. Pin the EN nav labels and the single brand constant so
// future edits centralize here instead of scattering literals.
describe("site sections (SIG-867)", () => {
  it("declares the brand as a proper-noun constant", () => {
    assert.equal(SITE_NAME, "Xadrez Digital");
  });

  it("keeps nav labels English and hrefs stable", () => {
    assert.deepEqual([...SITE_SECTIONS], [
      { href: "/courses", label: "Courses" },
      { href: "/puzzles", label: "Puzzles" },
      { href: "/studio", label: "Studio" },
    ]);
  });
});
