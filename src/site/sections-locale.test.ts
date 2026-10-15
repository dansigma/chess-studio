import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SITE_SECTIONS, siteSections } from "./sections.ts";

describe("localized site sections (SIG-962)", () => {
  it("returns English labels identical to SITE_SECTIONS for en", () => {
    assert.deepEqual(siteSections("en"), [...SITE_SECTIONS]);
  });

  it("returns Portuguese labels with stable hrefs for pt-br", () => {
    assert.deepEqual(siteSections("pt-br"), [
      { href: "/courses", label: "Cursos" },
      { href: "/puzzles", label: "Exercícios" },
      { href: "/studio", label: "Estúdio" },
    ]);
  });
});
