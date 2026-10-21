import assert from "node:assert/strict";
import test from "node:test";
import { PUZZLE_THEMES } from "../puzzles/types.ts";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { PUZZLE_STRING_KEYS, TABLES, tPuzzle } from "./puzzle-strings.ts";

test("puzzle string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every puzzle string key renders non-empty in both locales", () => {
  const keys = new Set<string>(PUZZLE_STRING_KEYS);
  assert.equal(keys.size, PUZZLE_STRING_KEYS.length, "puzzle string keys must be unique");
  for (const key of PUZZLE_STRING_KEYS) {
    assert.ok(tPuzzle("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tPuzzle("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("every puzzle theme id has a label in both locales", () => {
  for (const theme of PUZZLE_THEMES) {
    const key = `puzzle.theme.label.${theme}` as const;
    assert.ok(tPuzzle("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tPuzzle("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("every theme card id has a blurb in both locales", () => {
  const cardIds = [
    "mate",
    "fork",
    "pin",
    "skewer",
    "discoveredAttack",
    "backRank",
    "sacrifice",
    "endgame",
    "promotion",
  ] as const;
  for (const id of cardIds) {
    const key = `puzzle.theme.blurb.${id}` as const;
    assert.ok(tPuzzle("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tPuzzle("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("puzzle outcome strings render whole sentences with vars", () => {
  assert.equal(tPuzzle("en", "puzzle.panel.moveCounter", { current: 2, total: 3 }), "Move 2 of 3");
  assert.equal(tPuzzle("pt-br", "puzzle.panel.moveCounter", { current: 2, total: 3 }), "Lance 2 de 3");
  assert.equal(tPuzzle("en", "puzzle.panel.streakSummary", { solved: 0, best: 4 }), "0 in a row · best 4");
  assert.equal(
    tPuzzle("pt-br", "puzzle.panel.streakSummary", { solved: 0, best: 4 }),
    "0 em sequência · recorde 4",
  );
  assert.equal(tPuzzle("en", "puzzle.feedback.solvedCount.other", { count: 5 }), "5 puzzles solved");
  assert.equal(tPuzzle("pt-br", "puzzle.feedback.solvedCount.one", { count: 1 }), "1 problema resolvido");
});
