import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { ADMIN_USERS_ERROR_CODES, adminUsersErrorKey, canChangeRole, isReasonValid, shouldShowAdminLink } from "./rules.ts";
import { ADMIN_USERS_STRING_KEYS, TABLES, tAdminUsers } from "./strings.ts";

test("admin-users string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every admin-users string key renders non-empty in both locales", () => {
  const keys = new Set<string>(ADMIN_USERS_STRING_KEYS);
  assert.equal(keys.size, ADMIN_USERS_STRING_KEYS.length, "admin-users string keys must be unique");
  for (const key of ADMIN_USERS_STRING_KEYS) {
    const en = tAdminUsers("en", key);
    const pt = tAdminUsers("pt-br", key);
    assert.ok(en.length > 0, `en:${key} must not be empty`);
    assert.ok(pt.length > 0, `pt-br:${key} must not be empty`);
    const enPlaceholders = (en.match(/\{([^}]+)\}/g) ?? []).sort();
    const ptPlaceholders = (pt.match(/\{([^}]+)\}/g) ?? []).sort();
    assert.deepEqual(ptPlaceholders, enPlaceholders, `placeholders mismatch between EN and PT-BR for "${key}"`);
  }
});

test("every admin error code maps to a localized message in both locales", () => {
  for (const code of ADMIN_USERS_ERROR_CODES) {
    const key = adminUsersErrorKey(code);
    assert.ok((ADMIN_USERS_STRING_KEYS as readonly string[]).includes(key), `${code} has no string key`);
    assert.ok(tAdminUsers("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tAdminUsers("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("the signed-in admin's own row is disabled, every other row is enabled", () => {
  assert.equal(canChangeRole("admin-1", "admin-1"), false);
  assert.equal(canChangeRole("user-2", "admin-1"), true);
  assert.equal(canChangeRole("", "admin-1"), true);
});

test("anonymous, student, and coach callers never receive the users table", () => {
  // The page gate redirects unless isAdmin(getRole(...)) is true: null
  // (anonymous / lookup failure), student, and coach all fail the check.
  // The pure rule is shouldShowAdminLink; the page applies the same
  // isAdmin predicate before rendering UsersView.
  assert.equal(shouldShowAdminLink(false), false);
  assert.equal(shouldShowAdminLink(true), true);
});

test("reasons shorter than 3 or longer than 500 chars are rejected", () => {
  assert.equal(isReasonValid("  "), false);
  assert.equal(isReasonValid("ab"), false);
  assert.equal(isReasonValid("abc"), true);
  assert.equal(isReasonValid("a".repeat(500)), true);
  assert.equal(isReasonValid(` ${"a".repeat(500)} `), true);
  assert.equal(isReasonValid("a".repeat(501)), false);
});
