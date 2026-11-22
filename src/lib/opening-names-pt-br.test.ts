import assert from "node:assert/strict";
import test, { describe } from "node:test";
import catalog from "../data/openings-catalog.json" with { type: "json" };
import { PT_BR_FAMILIES } from "./opening-names.ts";
import {
  findEnglishGenericSurvivors,
  translateFamily,
  translateOpeningPart,
} from "./opening-names-pt-br.ts";

describe("translateOpeningPart", () => {
  test("SIG-1441 spec examples", () => {
    assert.equal(translateOpeningPart("Moscow Variation"), "Variante Moscou");
    assert.equal(translateOpeningPart("Najdorf Variation"), "Variante Najdorf");
    assert.equal(translateOpeningPart("Double Fianchetto Attack"), "Ataque Duplo Fianqueto");
    assert.equal(translateOpeningPart("Anti-Moscow Gambit"), "Gambito Anti-Moscou");
    assert.equal(translateOpeningPart("Grob Gambit Declined"), "Gambito Grob Recusado");
    assert.equal(translateOpeningPart("Fool's Mate"), "Mate do Louco");
    assert.equal(translateOpeningPart("Fried Liver Attack"), "Ataque Fígado Frito");
    assert.equal(translateOpeningPart("Poisoned Pawn Variation"), "Variante do Peão Envenenado");
  });

  test("head word moves to the front", () => {
    assert.equal(translateOpeningPart("Main Line"), "Linha Principal");
    assert.equal(translateOpeningPart("Haag Gambit"), "Gambito Haag");
    assert.equal(translateOpeningPart("Accelerated Dragon"), "Dragão Acelerado");
  });

  test("modifiers bound after the head follow it", () => {
    assert.equal(translateOpeningPart("Gambit Declined"), "Gambito Recusado");
    assert.equal(translateOpeningPart("Bird's Defense Deferred"), "Defesa Bird Adiada");
  });

  test("adjectives agree with the head word gender", () => {
    assert.equal(translateOpeningPart("Classical Variation"), "Variante Clássica");
    assert.equal(translateOpeningPart("Classical System"), "Sistema Clássico");
    assert.equal(translateOpeningPart("Double Attack"), "Ataque Duplo");
    assert.equal(translateOpeningPart("Double Defense"), "Defesa Dupla");
  });

  test("unknown tokens (person names) stay verbatim", () => {
    assert.equal(translateOpeningPart("Najdorf Variation"), "Variante Najdorf");
    assert.equal(translateOpeningPart("Mar del Plata Gambit"), "Gambito Mar del Plata");
    assert.equal(translateOpeningPart("Zilbermints-Hartlaub Gambit"), "Gambito Zilbermints-Hartlaub");
  });

  test("whole catalog translates without surviving English generic words", () => {
    let parts = 0;
    for (const { name } of catalog) {
      const colon = name.indexOf(":");
      if (colon === -1) continue;
      for (const raw of name.slice(colon + 1).split(",")) {
        const part = raw.trim();
        if (!part) continue;
        parts++;
        const survivors = findEnglishGenericSurvivors(translateOpeningPart(part));
        assert.deepEqual(survivors, [], `generic English survived in "${part}"`);
      }
    }
    assert.ok(parts > 2000, `expected the full catalog, got ${parts} parts`);
  });
});

describe("translateFamily", () => {
  test("every PT_BR_FAMILIES value is preserved in the glossary", () => {
    for (const [family, expected] of Object.entries(PT_BR_FAMILIES)) {
      assert.equal(translateFamily(family), expected);
    }
  });

  test("normalises defence spelling; unknown families pass through", () => {
    assert.equal(translateFamily("Modern Defence"), "Defesa Moderna");
    assert.equal(translateFamily("Some Unknown Defense"), "Some Unknown Defense");
  });

  test("every catalog family is in the glossary", () => {
    for (const { name } of catalog) {
      const colon = name.indexOf(":");
      const family = colon === -1 ? name : name.slice(0, colon);
      assert.notEqual(translateFamily(family), family, `missing family: ${family}`);
    }
  });
});
