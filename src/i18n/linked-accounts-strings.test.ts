import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { LINKED_ACCOUNTS_STRING_KEYS, TABLES, tLinkedAccounts } from "./linked-accounts-strings.ts";

test("linked-accounts string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every linked-accounts string key renders non-empty in both locales", () => {
  const keys = new Set<string>(LINKED_ACCOUNTS_STRING_KEYS);
  assert.equal(keys.size, LINKED_ACCOUNTS_STRING_KEYS.length, "linked-accounts string keys must be unique");
  for (const key of LINKED_ACCOUNTS_STRING_KEYS) {
    assert.ok(tLinkedAccounts("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tLinkedAccounts("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("section title renders in both locales", () => {
  assert.equal(tLinkedAccounts("en", "linkedAccounts.title"), "Linked accounts");
  assert.equal(tLinkedAccounts("pt-br", "linkedAccounts.title"), "Contas vinculadas");
});
