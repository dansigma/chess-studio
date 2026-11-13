import assert from "node:assert/strict";
import test, { describe, it } from "node:test";
import { PT_BR_OPENING_NAMES, localizeOpeningName, resolveOpeningName } from "./opening-names.ts";

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

// SIG-1304: family-prefix PT-BR localisation.
describe("localizeOpeningName (SIG-1304)", () => {
  it("translates the family and keeps the variation suffix", () => {
    assert.equal(
      localizeOpeningName("Sicilian Defense: Najdorf Variation", "pt-br"),
      "Defesa Siciliana: Najdorf Variation",
    );
    assert.equal(localizeOpeningName("Queen's Gambit Declined: Slav Defense", "pt-br"), "Gambito da Dama Recusado: Slav Defense");
  });

  it("handles Defense/Defence, curly apostrophes, accents and case", () => {
    assert.equal(localizeOpeningName("French Defence", "pt-br"), "Defesa Francesa");
    assert.equal(localizeOpeningName("King’s Gambit Accepted: Foo", "pt-br"), "Gambito do Rei Aceito: Foo");
    assert.equal(localizeOpeningName("Grunfeld Defense", "pt-br"), "Defesa Grünfeld");
    assert.equal(localizeOpeningName("Réti Opening", "pt-br"), "Abertura Réti");
    assert.equal(localizeOpeningName("ruy lopez: Berlin Defense", "pt-br"), "Ruy López: Berlin Defense");
  });

  it("matches a colon-less Chess.com style name by family prefix", () => {
    assert.equal(localizeOpeningName("Italian Game Two Knights Defense", "pt-br"), "Jogo Italiano Two Knights Defense");
  });

  it("returns unknown names unchanged", () => {
    assert.equal(localizeOpeningName("Zukertort Wobble: Foo", "pt-br"), "Zukertort Wobble: Foo");
  });

  it("never touches English", () => {
    assert.equal(localizeOpeningName("Sicilian Defense: Najdorf Variation", "en"), "Sicilian Defense: Najdorf Variation");
  });
});
