import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { MOBILE_STRING_KEYS, TABLES, tMobile } from "./mobile-strings.ts";

test("mobile string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every mobile string key renders non-empty in both locales", () => {
  const keys = new Set<string>(MOBILE_STRING_KEYS);
  assert.equal(keys.size, MOBILE_STRING_KEYS.length, "mobile string keys must be unique");
  for (const key of MOBILE_STRING_KEYS) {
    assert.ok(tMobile("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tMobile("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("mobile tab labels render the short tab names", () => {
  assert.equal(tMobile("en", "mobile.tabs.moves"), "Moves");
  assert.equal(tMobile("pt-br", "mobile.tabs.moves"), "Lances");
  assert.equal(tMobile("en", "mobile.tabs.engine"), "Engine");
  assert.equal(tMobile("pt-br", "mobile.tabs.engine"), "Motor");
  assert.equal(tMobile("en", "mobile.tabs.review"), "Review");
  assert.equal(tMobile("pt-br", "mobile.tabs.review"), "Análise");
  assert.equal(tMobile("en", "mobile.tabs.explorer"), "Explorer");
  assert.equal(tMobile("pt-br", "mobile.tabs.explorer"), "Explorador");
});

test("mobile menu labels render in both locales", () => {
  assert.equal(tMobile("en", "mobile.menu.open"), "Open menu");
  assert.equal(tMobile("pt-br", "mobile.menu.open"), "Abrir menu");
  assert.equal(tMobile("en", "mobile.menu.title"), "Menu");
  assert.equal(tMobile("pt-br", "mobile.menu.title"), "Menu");
  assert.equal(tMobile("en", "mobile.menu.close"), "Close menu");
  assert.equal(tMobile("pt-br", "mobile.menu.close"), "Fechar menu");
});
