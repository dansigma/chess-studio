import assert from "node:assert/strict";
import test from "node:test";
import { ALL_PUZZLES } from "./catalog-full";
import { PUZZLE_CATALOG } from "./catalog";
import {
  compilePuzzle,
  emptyProgress,
  rankedPuzzles,
  sessionTarget,
  type CompiledPuzzle,
} from "./engine";
import { getFallbackCatalog, loadPuzzleCatalog } from "./puzzle-client";
import { PUZZLE_THEMES, type PuzzleMode, type PuzzleTheme } from "./types";

const COMPILED_ALL: CompiledPuzzle[] = ALL_PUZZLES.map(compilePuzzle);

test("catalog size meets requirements: 500-1000 puzzles", () => {
  assert.ok(
    COMPILED_ALL.length >= 500 && COMPILED_ALL.length <= 1000,
    `Expected 500-1000 puzzles, got ${COMPILED_ALL.length}`
  );
});

test("catalog IDs and FENs are strictly unique", () => {
  const ids = new Set<string>();
  const fens = new Set<string>();
  for (const p of COMPILED_ALL) {
    assert.ok(!ids.has(p.id), `Duplicate puzzle ID: ${p.id}`);
    assert.ok(!fens.has(p.fen), `Duplicate puzzle FEN: ${p.fen}`);
    ids.add(p.id);
    fens.add(p.fen);
  }
});

test("original 18 puzzles remain at the head of ALL_PUZZLES", () => {
  assert.equal(PUZZLE_CATALOG.length, 18);
  for (let i = 0; i < PUZZLE_CATALOG.length; i++) {
    assert.equal(ALL_PUZZLES[i]?.id, PUZZLE_CATALOG[i]?.id);
    assert.equal(ALL_PUZZLES[i]?.fen, PUZZLE_CATALOG[i]?.fen);
    assert.equal(ALL_PUZZLES[i]?.rating, PUZZLE_CATALOG[i]?.rating);
  }
});

test("rating range spans 700 to 2400 with coverage across all tiers", () => {
  const minRating = Math.min(...COMPILED_ALL.map((p) => p.rating));
  const maxRating = Math.max(...COMPILED_ALL.map((p) => p.rating));
  assert.ok(minRating <= 750, `Expected min rating <= 750, got ${minRating}`);
  assert.ok(maxRating >= 2350, `Expected max rating >= 2350, got ${maxRating}`);

  // Check 200-rating wide bands
  for (let bandStart = 700; bandStart < 2400; bandStart += 200) {
    const bandEnd = bandStart + 199;
    const inBand = COMPILED_ALL.filter(
      (p) => p.rating >= bandStart && p.rating <= bandEnd
    );
    assert.ok(
      inBand.length >= 15,
      `Band ${bandStart}-${bandEnd} has only ${inBand.length} puzzles (expected >= 15)`
    );
  }
});

test("all 13 tactical themes have substantial puzzle counts", () => {
  for (const theme of PUZZLE_THEMES) {
    const themed = COMPILED_ALL.filter((p) => p.themes.includes(theme));
    assert.ok(
      themed.length >= 10,
      `Theme ${theme} has only ${themed.length} puzzles (expected >= 10)`
    );
  }
});

test("session simulation: Rush mode pulls fresh puzzles without duplicates", () => {
  const progress = emptyProgress();
  const exclude = new Set<string>();
  const mode: PuzzleMode = "rush";

  // Simulate solving 80 puzzles in a single rush session
  for (let solved = 0; solved < 80; solved++) {
    const target = sessionTarget(progress.rating, solved, mode);
    const ranked = rankedPuzzles(COMPILED_ALL, target, exclude);
    assert.ok(ranked.length > 0, `No puzzles available at step ${solved}`);

    const windowed = ranked.slice(0, Math.min(4, ranked.length));
    const chosen = windowed[0]!;

    assert.ok(
      !exclude.has(chosen.id),
      `Duplicate puzzle ${chosen.id} selected at step ${solved}`
    );
    exclude.add(chosen.id);
  }

  assert.equal(exclude.size, 80);
});

test("session simulation: Rated mode with theme pulls fresh puzzles", () => {
  const progress = emptyProgress();
  const exclude = new Set<string>();
  const mode: PuzzleMode = "rated";
  const theme: PuzzleTheme = "pin";

  // Simulate solving 30 pin puzzles in a session
  for (let solved = 0; solved < 30; solved++) {
    const target = sessionTarget(progress.rating, solved, mode);
    const ranked = rankedPuzzles(COMPILED_ALL, target, exclude, theme);
    assert.ok(ranked.length > 0, `No pin puzzles available at step ${solved}`);

    const chosen = ranked[0]!;
    assert.ok(
      !exclude.has(chosen.id),
      `Duplicate pin puzzle ${chosen.id} selected at step ${solved}`
    );
    assert.ok(chosen.themes.includes("pin"));
    exclude.add(chosen.id);
  }

  assert.equal(exclude.size, 30);
});

test("fallback catalog offline support", async () => {
  const fallback = getFallbackCatalog();
  assert.equal(fallback.length, PUZZLE_CATALOG.length);
  assert.equal(fallback[0]?.id, "queen-corridor");

  // When fetch throws (e.g. simulated network failure in test environment where window.fetch is undefined)
  const loaded = await loadPuzzleCatalog();
  assert.ok(Array.isArray(loaded));
  assert.equal(loaded.length, PUZZLE_CATALOG.length);

  // Fallback with theme filter
  const forkLoaded = await loadPuzzleCatalog({ theme: "fork" });
  assert.ok(forkLoaded.every((p) => p.themes.includes("fork")));
});
