// SIG-1101: prep strings alignment test. Missing PT-BR keys fail `tsc`;
// this asserts the tables stay aligned and every key renders non-empty.
import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { PREP_STRING_KEYS, TABLES, tPrep } from "./prep-strings.ts";

test("prep string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every prep string key renders non-empty in both locales", () => {
  const keys = new Set<string>(PREP_STRING_KEYS);
  assert.equal(keys.size, PREP_STRING_KEYS.length, "prep string keys must be unique");
  for (const key of PREP_STRING_KEYS) {
    assert.ok(tPrep("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tPrep("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("prep interpolated strings render whole sentences with vars", () => {
  assert.equal(tPrep("en", "prep.gamesAnalyzed.one", { count: 1 }), "1 game analyzed");
  assert.equal(tPrep("en", "prep.gamesAnalyzed.other", { count: 3 }), "3 games analyzed");
  assert.equal(tPrep("pt-br", "prep.gamesAnalyzed.one", { count: 1 }), "1 partida analisada");
  assert.equal(tPrep("pt-br", "prep.gamesAnalyzed.other", { count: 3 }), "3 partidas analisadas");
});
