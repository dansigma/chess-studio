import assert from "node:assert/strict";
import { test } from "node:test";
import { sectionLabel } from "./section-label.ts";

test("localizes known section names in pt-br after trimming and ignoring case", () => {
  assert.equal(sectionLabel(" Open ", "pt-br"), "Absoluto");
  assert.equal(sectionLabel("gIrLs", "pt-br"), "Feminino");
  assert.equal(sectionLabel(" WOMEN ", "pt-br"), "Feminino");
});

test("preserves original section names in English", () => {
  for (const name of [" Open ", "gIrLs", "WOMEN"]) {
    assert.equal(sectionLabel(name, "en"), name);
  }
});

test("preserves unknown section names in both locales", () => {
  for (const name of [" Masters ", "Challengers", "Rapid", "Blitz", "U18", "Women U18", "FIDE Open", "constructor", ""]) {
    assert.equal(sectionLabel(name, "pt-br"), name);
    assert.equal(sectionLabel(name, "en"), name);
  }
});
