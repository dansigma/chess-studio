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

describe("localizeOpeningName", () => {
  it("translates the family and every variation part", () => {
    assert.equal(
      localizeOpeningName("Sicilian Defense: Najdorf Variation", "pt-br"),
      "Defesa Siciliana: Variante Najdorf",
    );
    assert.equal(localizeOpeningName("Queen's Gambit Declined: Slav Defense", "pt-br"), "Gambito da Dama Recusado: Defesa Eslava");
  });

  it("uses the reviewed catalog translations and preserves established labels", () => {
    assert.equal(localizeOpeningName("Semi-Slav Defense: Moscow Variation", "pt-br"), "Defesa Semi-Eslava: Variante Moscou");
    assert.equal(localizeOpeningName("Zukertort Opening: Double Fianchetto Attack", "pt-br"), "Abertura Zukertort: Ataque Duplo Fianqueto");
    assert.equal(localizeOpeningName("Sicilian Defense: Moscow Variation, Dorfman Gambit", "pt-br"), "Defesa Siciliana: Variante Moscou, Gambito Dorfman");
    assert.equal(localizeOpeningName("Sicilian Defense", "pt-br"), "Defesa Siciliana");
    assert.equal(localizeOpeningName("Reti Opening", "pt-br", "A13"), "Abertura Réti");
    assert.equal(localizeOpeningName("Sicilian Defense: Najdorf Variation", "pt-br", "B90"), "Defesa Siciliana: Variante Najdorf");
    assert.equal(resolveOpeningName("C11", "French Defense: Winawer Variation", "pt-br"), "Defesa Francesa: Variante Winawer");
    assert.equal(resolveOpeningName("C11", "Defesa Francesa: Variante Winawer", "pt-br"), "Defesa Francesa: Variante Winawer");
  });

  it("handles Defense/Defence, curly apostrophes, accents and case", () => {
    assert.equal(localizeOpeningName("French Defence", "pt-br"), "Defesa Francesa");
    assert.equal(localizeOpeningName("King’s Gambit Accepted: Foo", "pt-br"), "Gambito do Rei Aceito: Foo");
    assert.equal(localizeOpeningName("Grunfeld Defense", "pt-br"), "Defesa Grünfeld");
    assert.equal(localizeOpeningName("Réti Opening", "pt-br"), "Abertura Réti");
    assert.equal(localizeOpeningName("ruy lopez: Berlin Defense", "pt-br"), "Ruy López: Defesa Berlim");
  });

  it("matches a colon-less Chess.com style name by family prefix", () => {
    assert.equal(localizeOpeningName("Italian Game Two Knights Defense", "pt-br"), "Jogo Italiano Defesa dos Dois Cavalos");
    assert.equal(localizeOpeningName("  Sicilian   Defence Moscow Variation", "pt-br"), "Defesa Siciliana Variante Moscou");
    assert.equal(localizeOpeningName("French Defense O’Example,   Foo", "pt-br"), "Defesa Francesa O’Example,   Foo");
    assert.equal(localizeOpeningName("French Defense: O’Example Variation", "pt-br"), "Defesa Francesa: Variante O’Example");
  });

  it("returns unknown names unchanged", () => {
    assert.equal(localizeOpeningName("Zukertort Wobble: Foo", "pt-br"), "Zukertort Wobble: Foo");
  });

  it("never touches English", () => {
    assert.equal(localizeOpeningName("Sicilian Defense: Najdorf Variation", "en"), "Sicilian Defense: Najdorf Variation");
  });
});
