// SIG-1304: family-prefix PT-BR localisation of opening names.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localizeOpeningName } from "./opening-names.ts";

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
