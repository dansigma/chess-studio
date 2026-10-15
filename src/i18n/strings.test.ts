import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { t } from "./strings.ts";

describe("site strings (SIG-962)", () => {
  it("returns English labels for en", () => {
    assert.equal(t("en", "nav.courses"), "Courses");
    assert.equal(t("en", "nav.puzzles"), "Puzzles");
    assert.equal(t("en", "nav.studio"), "Studio");
  });

  it("returns Portuguese labels for pt-br", () => {
    assert.equal(t("pt-br", "nav.courses"), "Cursos");
    assert.equal(t("pt-br", "nav.puzzles"), "Exercícios");
    assert.equal(t("pt-br", "nav.studio"), "Estúdio");
  });
});
