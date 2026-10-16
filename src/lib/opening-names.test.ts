import assert from "node:assert/strict";
import test from "node:test";
import { PT_BR_OPENING_NAMES, resolveOpeningName } from "./opening-names.ts";

test("B20 resolves to Defesa Siciliana in PT-BR", () => {
  assert.equal(resolveOpeningName("B20", "Sicilian Defense", "pt-br"), "Defesa Siciliana");
});

test("unknown ECO falls back to the English book name verbatim", () => {
  assert.equal(resolveOpeningName("Z99", "Some Fancy Attack", "pt-br"), "Some Fancy Attack");
});

test("en always returns the fallback untouched", () => {
  for (const key of Object.keys(PT_BR_OPENING_NAMES)) {
    if (key.includes("|")) {
      continue;
    }
    assert.equal(resolveOpeningName(key, "English fallback", "en"), "English fallback");
  }
  assert.equal(resolveOpeningName("B20", "Sicilian Defense", "en"), "Sicilian Defense");
});

test("A13 composite disambiguates Reti from English", () => {
  assert.equal(resolveOpeningName("A13", "English Opening", "pt-br"), "Abertura Inglesa");
  assert.equal(resolveOpeningName("A13", "Reti Opening", "pt-br"), "Abertura Réti");
});

test("lookup is case-insensitive and trims whitespace", () => {
  assert.equal(resolveOpeningName(" b90 ", "Sicilian Najdorf", "pt-br"), "Defesa Siciliana: Variante Najdorf");
});
