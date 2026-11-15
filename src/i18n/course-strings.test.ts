import assert from "node:assert/strict";
import test from "node:test";
import { COURSE_THEMES } from "../courses/types.ts";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { COURSE_STRING_KEYS, TABLES, tCourse } from "./course-strings.ts";

test("course string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every course string key renders non-empty in both locales", () => {
  const keys = new Set<string>(COURSE_STRING_KEYS);
  assert.equal(keys.size, COURSE_STRING_KEYS.length, "course string keys must be unique");
  for (const key of COURSE_STRING_KEYS) {
    assert.ok(tCourse("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tCourse("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("every course theme id has a label in both locales", () => {
  for (const theme of COURSE_THEMES) {
    const key = `course.theme.label.${theme.id}` as const;
    assert.ok(tCourse("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tCourse("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("tier labels render for every access tier in both locales", () => {
  for (const tier of ["free", "premium"] as const) {
    const key = `course.tier.${tier}` as const;
    assert.ok(tCourse("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tCourse("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
  assert.equal(tCourse("en", "course.tier.price", { price: "19,90" }), "R$ 19,90");
  assert.equal(tCourse("pt-br", "course.tier.price", { price: "19,90" }), "R$ 19,90");
});

test("Aprender mode and summary labels match the redesign", () => {
  assert.equal(tCourse("en", "course.lesson.mode.learn"), "Learn");
  assert.equal(tCourse("pt-br", "course.lesson.mode.learn"), "Aprender");
  assert.equal(tCourse("en", "course.lesson.mode.train"), "Train");
  assert.equal(tCourse("pt-br", "course.lesson.mode.train"), "Treinar");
  assert.equal(
    tCourse("en", "course.lesson.summary.moves", { count: "7" }),
    "Moves played: 7",
  );
  assert.equal(
    tCourse("pt-br", "course.lesson.summary.moves", { count: "7" }),
    "Lances jogados: 7",
  );
  assert.equal(
    tCourse("pt-br", "course.lesson.summary.mistakes", { count: "2" }),
    "Erros: 2",
  );
  assert.equal(tCourse("pt-br", "course.lesson.summary.heading"), "Linha concluída");
  assert.equal(tCourse("pt-br", "course.lesson.summary.plan"), "Plano estratégico");
  assert.equal(tCourse("pt-br", "course.lesson.summary.restart"), "Refazer");
  assert.equal(
    tCourse("pt-br", "course.lesson.summary.review"),
    "Continuar para Revisão",
  );
});

test("course outcome strings render whole sentences with vars", () => {
  assert.equal(tCourse("en", "course.lesson.stepCounter", { current: 2, total: 5 }), "2 / 5");
  assert.equal(tCourse("pt-br", "course.lesson.stepCounter", { current: 2, total: 5 }), "2 / 5");
  assert.equal(tCourse("en", "course.lesson.yourMove", { san: "Nf3" }), "Your move: Nf3");
  assert.equal(tCourse("pt-br", "course.lesson.yourMove", { san: "Nf3" }), "Seu lance: Nf3");
  assert.equal(
    tCourse("en", "course.catalog.counts", { chapters: "3 chapters", lines: "12 lines" }),
    "3 chapters · 12 lines",
  );
  assert.equal(
    tCourse("pt-br", "course.catalog.counts", { chapters: "3 capítulos", lines: "12 linhas" }),
    "3 capítulos · 12 linhas",
  );
  assert.equal(tCourse("en", "course.catalog.chapters.one", { count: 1 }), "1 chapter");
  assert.equal(tCourse("pt-br", "course.catalog.chapters.other", { count: 5 }), "5 capítulos");
});
