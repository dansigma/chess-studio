import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { AUTH_STRING_KEYS, TABLES, tAuth } from "./auth-strings.ts";

test("auth string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every auth string key renders non-empty in both locales", () => {
  const keys = new Set<string>(AUTH_STRING_KEYS);
  assert.equal(keys.size, AUTH_STRING_KEYS.length, "auth string keys must be unique");
  for (const key of AUTH_STRING_KEYS) {
    assert.ok(tAuth("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tAuth("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("auth outcome strings render whole sentences with vars", () => {  assert.equal(
    tAuth("en", "auth.error.passwordTooShort", { min: 10 }),
    "Password must be at least 10 characters.",
  );
  assert.equal(
    tAuth("pt-br", "auth.error.passwordTooShort", { min: 10 }),
    "A senha deve ter pelo menos 10 caracteres.",
  );
});

test("alignment util throws on a missing key", () => {
  assert.throws(
    () => assertStringTablesAligned({ a: "A" }, {} as Record<"a", string>),
    /same keys/,
  );
});

test("alignment util throws on an empty value", () => {
  assert.throws(
    () => assertStringTablesAligned({ a: "A" }, { a: "" }),
    /must not be empty/,
  );
});

test("alignment util throws on a placeholder mismatch", () => {
  assert.throws(
    () => assertStringTablesAligned({ a: "Hello {name}" }, { a: "Olá" }),
    /placeholders mismatch/,
  );
});
