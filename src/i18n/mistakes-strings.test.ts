import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { MISTAKE_STRING_KEYS, TABLES, tMistakes } from "./mistakes-strings.ts";

test("mistake string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every mistake string key renders non-empty in both locales", () => {
  const keys = new Set<string>(MISTAKE_STRING_KEYS);
  assert.equal(keys.size, MISTAKE_STRING_KEYS.length, "mistake string keys must be unique");
  for (const key of MISTAKE_STRING_KEYS) {
    assert.ok(tMistakes("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tMistakes("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("mistake detail strings render whole sentences with vars", () => {
  assert.equal(tMistakes("en", "mistakes.dashboard.detail.one", { count: 1 }), "1 exercise due");
  assert.equal(tMistakes("en", "mistakes.dashboard.detail.other", { count: 3 }), "3 exercises due");
  assert.equal(
    tMistakes("pt-br", "mistakes.dashboard.detail.one", { count: 1 }),
    "1 exercício para revisar",
  );
  assert.equal(tMistakes("en", "mistakes.trainer.caughtUp.nextDue", { date: "Oct 31" }), "Next exercise due Oct 31");
});
