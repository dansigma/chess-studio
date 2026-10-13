import { strict as assert } from "node:assert";
import test from "node:test";
import { ALL_PUZZLES } from "./catalog-full";
import { PUZZLE_CATALOG } from "./catalog";
import { compilePuzzle, type CompiledPuzzle } from "./engine";
import { queryPuzzles, isPuzzleTheme } from "./query";
import { PUZZLE_THEMES } from "./types";

const ALL_COMPILED: CompiledPuzzle[] = ALL_PUZZLES.map(compilePuzzle);

test("queryPuzzles: empty options returns entire catalog", () => {
  const result = queryPuzzles(ALL_COMPILED);
  assert.equal(result.total, ALL_COMPILED.length);
  assert.equal(result.items.length, ALL_COMPILED.length);
  assert.equal(result.items[0]?.id, ALL_COMPILED[0]?.id);
});

test("queryPuzzles: filter by theme", () => {
  for (const theme of PUZZLE_THEMES) {
    const result = queryPuzzles(ALL_COMPILED, { theme });
    assert.ok(result.total > 0, `Expected puzzles for theme ${theme}`);
    for (const puzzle of result.items) {
      assert.ok(
        puzzle.themes.includes(theme),
        `Puzzle ${puzzle.id} does not contain theme ${theme}`
      );
    }
  }
});

test("queryPuzzles: filter by minRating and maxRating", () => {
  const result = queryPuzzles(ALL_COMPILED, { minRating: 1200, maxRating: 1500 });
  assert.ok(result.total > 0);
  for (const puzzle of result.items) {
    assert.ok(puzzle.rating >= 1200, `Rating ${puzzle.rating} < 1200`);
    assert.ok(puzzle.rating <= 1500, `Rating ${puzzle.rating} > 1500`);
  }
});

test("queryPuzzles: filter by theme and rating range combined (pin 1200-1500)", () => {
  const result = queryPuzzles(ALL_COMPILED, {
    theme: "pin",
    minRating: 1200,
    maxRating: 1500,
  });
  assert.ok(result.total > 0, "Expected pin puzzles between 1200 and 1500");
  for (const puzzle of result.items) {
    assert.ok(puzzle.themes.includes("pin"));
    assert.ok(puzzle.rating >= 1200 && puzzle.rating <= 1500);
  }
});

test("queryPuzzles: pagination offset and limit", () => {
  const full = queryPuzzles(ALL_COMPILED);
  const page1 = queryPuzzles(ALL_COMPILED, { limit: 10, offset: 0 });
  const page2 = queryPuzzles(ALL_COMPILED, { limit: 10, offset: 10 });

  assert.equal(page1.items.length, 10);
  assert.equal(page2.items.length, 10);
  assert.equal(page1.total, full.total);
  assert.equal(page2.total, full.total);

  assert.notEqual(page1.items[0]?.id, page2.items[0]?.id);
  assert.equal(page1.items[9]?.id, full.items[9]?.id);
  assert.equal(page2.items[0]?.id, full.items[10]?.id);
});

test("queryPuzzles: exclude set/array filters out specified IDs", () => {
  const toExclude = [ALL_COMPILED[0]!.id, ALL_COMPILED[1]!.id];
  const result = queryPuzzles(ALL_COMPILED, { exclude: toExclude });
  assert.equal(result.total, ALL_COMPILED.length - 2);
  const resultIds = new Set(result.items.map((p) => p.id));
  assert.ok(!resultIds.has(toExclude[0]!));
  assert.ok(!resultIds.has(toExclude[1]!));
});

test("queryPuzzles: seed creates deterministic shuffle", () => {
  const r1 = queryPuzzles(ALL_COMPILED, { seed: 12345, limit: 20 });
  const r2 = queryPuzzles(ALL_COMPILED, { seed: 12345, limit: 20 });
  const r3 = queryPuzzles(ALL_COMPILED, { seed: 54321, limit: 20 });

  assert.deepEqual(
    r1.items.map((p) => p.id),
    r2.items.map((p) => p.id),
    "Same seed should produce identical order"
  );
  assert.notDeepEqual(
    r1.items.map((p) => p.id),
    r3.items.map((p) => p.id),
    "Different seed should produce different order"
  );
});

test("queryPuzzles: validation errors", () => {
  assert.throws(() => queryPuzzles(ALL_COMPILED, { theme: "invalidTheme" as any }), /Invalid theme/);
  assert.throws(() => queryPuzzles(ALL_COMPILED, { minRating: -5 }), /Invalid minRating/);
  assert.throws(() => queryPuzzles(ALL_COMPILED, { maxRating: -5 }), /Invalid maxRating/);
  assert.throws(() => queryPuzzles(ALL_COMPILED, { minRating: 1500, maxRating: 1000 }), /minRating.*cannot exceed maxRating/);
  assert.throws(() => queryPuzzles(ALL_COMPILED, { limit: 0 }), /Invalid limit/);
  assert.throws(() => queryPuzzles(ALL_COMPILED, { offset: -1 }), /Invalid offset/);
});

test("isPuzzleTheme utility", () => {
  assert.equal(isPuzzleTheme("fork"), true);
  assert.equal(isPuzzleTheme("pin"), true);
  assert.equal(isPuzzleTheme("notATheme"), false);
  assert.equal(isPuzzleTheme(null), false);
  assert.equal(isPuzzleTheme(123), false);
});
