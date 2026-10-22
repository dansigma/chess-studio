import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { COURSE_ADMIN_STRING_KEYS, TABLES, tCourseAdmin } from "./course-admin-strings.ts";

test("course admin string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every course admin string key renders non-empty in both locales", () => {
  const keys = new Set<string>(COURSE_ADMIN_STRING_KEYS);
  assert.equal(keys.size, COURSE_ADMIN_STRING_KEYS.length, "course admin string keys must be unique");
  for (const key of COURSE_ADMIN_STRING_KEYS) {
    assert.ok(tCourseAdmin("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tCourseAdmin("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("course admin interpolated strings render whole sentences with vars", () => {
  assert.equal(tCourseAdmin("en", "course.admin.chapter.heading", { n: 2 }), "Chapter 2");
  assert.equal(tCourseAdmin("pt-br", "course.admin.chapter.heading", { n: 2 }), "Capítulo 2");
  assert.equal(
    tCourseAdmin("en", "course.admin.error.lineNeedsPgn", { title: "Main" }),
    "The line “Main” needs a PGN.",
  );
  assert.equal(
    tCourseAdmin("pt-br", "course.admin.error.lineNeedsPgn", { title: "Principal" }),
    "A linha “Principal” precisa de um PGN.",
  );
  assert.equal(
    tCourseAdmin("en", "course.admin.confirm.replaceDraft", { title: "Caro" }),
    "Replace the published course “Caro” with this browser draft?",
  );
  assert.equal(
    tCourseAdmin("pt-br", "course.admin.confirm.replaceDraft", { title: "Caro" }),
    "Substituir o curso publicado “Caro” por este rascunho do navegador?",
  );
});
