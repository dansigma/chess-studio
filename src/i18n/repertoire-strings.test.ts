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
