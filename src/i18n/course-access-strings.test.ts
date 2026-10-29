import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { COURSE_ACCESS_STRING_KEYS, COURSE_ACCESS_TABLES, tCourseAccess } from "./course-access-strings.ts";

test("course access string tables are aligned across locales", () => {
  assertStringTablesAligned(COURSE_ACCESS_TABLES.en, COURSE_ACCESS_TABLES["pt-br"]);
});

test("every course access string key renders non-empty in both locales", () => {
  const keys = new Set<string>(COURSE_ACCESS_STRING_KEYS);
  assert.equal(keys.size, COURSE_ACCESS_STRING_KEYS.length, "course access string keys must be unique");
  for (const key of COURSE_ACCESS_STRING_KEYS) {
    assert.ok(tCourseAccess("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tCourseAccess("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("buy label interpolates the formatted price", () => {
  assert.equal(tCourseAccess("en", "course.access.buyToStudy", { price: "R$ 19,90" }), "Buy for R$ 19,90");
  assert.equal(tCourseAccess("pt-br", "course.access.buyToStudy", { price: "R$ 19,90" }), "Comprar por R$ 19,90");
});
