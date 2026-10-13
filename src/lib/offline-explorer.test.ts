import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { START_FEN } from "../chess/tree.ts";
import { positionKey } from "../chess/zobrist.ts";
import {
  getCuratedPositionKey,
  lookupCuratedIndex,
  warmCuratedIndex,
} from "./offline-explorer.ts";
import { lookupOpeningIndex, setIndexDatabaseForTesting } from "./opening-index.ts";

test("getCuratedPositionKey matches positionKey", () => {
  assert.equal(getCuratedPositionKey(START_FEN), positionKey(START_FEN));
});

test("lookupCuratedIndex resolves START_FEN from opening book in sub-50ms", () => {
  warmCuratedIndex();
  const start = performance.now();
  const res = lookupCuratedIndex(START_FEN);
  const elapsed = performance.now() - start;

  assert.equal(res.source, "curated");
  assert.equal(res.moves.length > 0, true);
  assert.equal(res.moves.some((m) => m.san === "e4" || m.san === "d4"), true);
  assert.equal(elapsed < 50, true, `Lookup took ${elapsed}ms, expected < 50ms`);
});

test("lookupCuratedIndex respects filters", () => {
  const resAll = lookupCuratedIndex(START_FEN);
  const resFiltered = lookupCuratedIndex(START_FEN, {
    speeds: ["classical"],
    minRating: 2800,
    sinceYear: 2050,
    untilYear: null,
  });

  assert.equal(resFiltered.source, "curated");
  assert.equal(resFiltered.games.length, 0);
  assert.equal(resAll.moves.length, resFiltered.moves.length);
});

test("lookupCuratedIndex gracefully handles unknown position", () => {
  const weirdFen = "8/8/8/8/8/8/8/4K2k w - - 0 1";
  const res = lookupCuratedIndex(weirdFen);
  assert.equal(res.source, "curated");
  assert.equal(res.moves.length, 0);
  assert.equal(res.games.length, 0);
  assert.equal(typeof res.notice, "string");
});

test("lookupCuratedIndex integrates with sqlite opening index when present", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO meta VALUES ('complete', '1');
    CREATE TABLE moves (
      pos TEXT NOT NULL,
      uci TEXT NOT NULL,
      san TEXT NOT NULL,
      white INTEGER NOT NULL,
      draws INTEGER NOT NULL,
      black INTEGER NOT NULL,
      PRIMARY KEY (pos, uci)
    );
  `);
  const pos = positionKey(START_FEN).toString();
  db.prepare(
    "INSERT INTO moves (pos, uci, san, white, draws, black) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(pos, "e2e4", "e4", 100, 50, 25);

  try {
    setIndexDatabaseForTesting(db);
    const res = lookupCuratedIndex(START_FEN, undefined, lookupOpeningIndex);
    assert.equal(res.source, "curated");
    assert.equal(res.moves.length, 1);
    assert.equal(res.moves[0].san, "e4");
    assert.equal(res.moves[0].white, 100);
    assert.equal(res.moves[0].draws, 50);
    assert.equal(res.moves[0].black, 25);
    assert.equal(res.moves[0].games, 175);
  } finally {
    setIndexDatabaseForTesting(null);
    db.close();
  }
});
