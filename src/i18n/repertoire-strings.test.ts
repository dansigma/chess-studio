import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { REPERTOIRE_STRING_KEYS, TABLES, tRepertoire } from "./repertoire-strings.ts";

test("repertoire string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every repertoire string key renders non-empty in both locales", () => {
  const keys = new Set<string>(REPERTOIRE_STRING_KEYS);
  assert.equal(keys.size, REPERTOIRE_STRING_KEYS.length, "repertoire string keys must be unique");
  for (const key of REPERTOIRE_STRING_KEYS) {
    assert.ok(tRepertoire("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tRepertoire("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("repertoire mark entries are translated", () => {
  assert.equal(tRepertoire("en", "repertoire.mark.useWhite"), "Use as White repertoire");
  assert.equal(tRepertoire("pt-br", "repertoire.mark.useWhite"), "Usar como repertório de Brancas");
  assert.equal(tRepertoire("en", "repertoire.mark.useBlack"), "Use as Black repertoire");
  assert.equal(tRepertoire("pt-br", "repertoire.mark.useBlack"), "Usar como repertório de Pretas");
  assert.equal(tRepertoire("en", "repertoire.mark.remove"), "Remove repertoire mark");
  assert.equal(tRepertoire("pt-br", "repertoire.mark.remove"), "Remover marca de repertório");
});

test("repertoire deviation sentences are translated", () => {  assert.equal(
    tRepertoire("en", "repertoire.deviation.leftBadge", { move: "7…Nf6" }),
    "Left your repertoire at 7…Nf6",
  );
  assert.equal(
    tRepertoire("pt-br", "repertoire.deviation.leftBadge", { move: "7…Nf6" }),
    "Você saiu do repertório em 7…Nf6",
  );
  assert.equal(
    tRepertoire("en", "repertoire.deviation.gapBadge", { move: "9…h5" }),
    "Opponent novelty at 9…h5",
  );
  assert.equal(
    tRepertoire("pt-br", "repertoire.deviation.gapBadge", { move: "9…h5" }),
    "Novidade do adversário em 9…h5",
  );
  assert.equal(tRepertoire("en", "repertoire.deviation.lineEnded"), "Line ended");
  assert.equal(tRepertoire("pt-br", "repertoire.deviation.lineEnded"), "Linha encerrada");
  assert.ok(tRepertoire("en", "repertoire.deviation.noRepertoireHint").length > 0);
  assert.ok(tRepertoire("pt-br", "repertoire.deviation.noRepertoireHint").length > 0);
  assert.equal(
    tRepertoire("en", "repertoire.deviation.reviewUser", { played: "7…Nf6", repertoire: "7…Be7" }),
    "You left your repertoire at 7…Nf6; your line is 7…Be7",
  );
  assert.equal(
    tRepertoire("pt-br", "repertoire.deviation.reviewUser", { played: "7…Nf6", repertoire: "7…Be7" }),
    "Você saiu do repertório em 7…Nf6; sua linha é 7…Be7",
  );
  assert.equal(
    tRepertoire("en", "repertoire.deviation.reviewGap", { played: "9…h5" }),
    "Your repertoire has no answer to 9…h5",
  );
  assert.equal(
    tRepertoire("pt-br", "repertoire.deviation.reviewGap", { played: "9…h5" }),
    "Seu repertório não tem resposta para 9…h5",
  );
});

test("repertoire deviation action sentences are translated", () => {
  assert.equal(tRepertoire("en", "repertoire.deviation.trainLine"), "Train this line");
  assert.equal(tRepertoire("pt-br", "repertoire.deviation.trainLine"), "Treinar esta linha");
  assert.equal(tRepertoire("en", "repertoire.deviation.addGap"), "Add to repertoire");
  assert.equal(tRepertoire("pt-br", "repertoire.deviation.addGap"), "Adicionar ao repertório");
  assert.equal(
    tRepertoire("en", "repertoire.deviation.noBoard"),
    "Mark a board as your White or Black repertoire from the board menu first.",
  );
  assert.equal(
    tRepertoire("pt-br", "repertoire.deviation.noBoard"),
    "Marque um tabuleiro como seu repertório de Brancas ou Pretas no menu do tabuleiro primeiro.",
  );
  assert.equal(
    tRepertoire("en", "repertoire.deviation.gapAdded"),
    "Opponent move added — now play your reply.",
  );
  assert.equal(
    tRepertoire("pt-br", "repertoire.deviation.gapAdded"),
    "Lance do adversário adicionado — agora jogue sua resposta.",
  );
  assert.ok(tRepertoire("en", "repertoire.deviation.gapInvalid").length > 0);
  assert.ok(tRepertoire("pt-br", "repertoire.deviation.gapInvalid").length > 0);
  assert.equal(
    tRepertoire("en", "repertoire.deviation.missingLine"),
    "That line is no longer in the repertoire.",
  );
  assert.equal(
    tRepertoire("pt-br", "repertoire.deviation.missingLine"),
    "Essa linha não está mais no repertório.",
  );
});

test("repertoire deviation stats section is translated", () => {
  assert.equal(tRepertoire("en", "repertoire.deviation.statsTitle"), "Where you leave your repertoire");
  assert.equal(tRepertoire("pt-br", "repertoire.deviation.statsTitle"), "Onde você sai do repertório");
  assert.equal(tRepertoire("en", "repertoire.deviation.statsCount.one", { count: 1 }), "1 game");
  assert.equal(tRepertoire("en", "repertoire.deviation.statsCount.other", { count: 5 }), "5 games");
  assert.equal(tRepertoire("pt-br", "repertoire.deviation.statsCount.one", { count: 1 }), "1 partida");
  assert.equal(tRepertoire("pt-br", "repertoire.deviation.statsCount.other", { count: 5 }), "5 partidas");
});
