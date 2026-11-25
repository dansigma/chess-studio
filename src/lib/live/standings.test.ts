import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mapTourPlayers, mapTourSummary } from "./lichess-broadcast";
import { findStandingRow } from "./standings";

const players = JSON.parse(readFileSync(new URL("./fixtures/tour-players.json", import.meta.url), "utf8"));

test("maps the ranked Lichess player list and its rating statistics", () => {
  const rows = mapTourPlayers(players);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3]);
  assert.deepEqual(rows[0], {
    rank: 1, name: "Sun, Yunjin", title: null, rating: 1883, fed: "CHN", fideId: 8688672,
    played: 3, score: 3, ratingDiff: 24, performance: 2441,
  });
  assert.deepEqual(mapTourPlayers([]), []);
  assert.deepEqual(mapTourPlayers([{}, null]), []);
});

test("prefers the tour FIDE time control and maps the external standings link", () => {
  const tour = mapTourSummary({ info: { fideTC: "rapid", standings: "https://s3.chess-results.com/tnr1514275.aspx?art=1" } });
  assert.equal(tour.standingsUrl, "https://s3.chess-results.com/tnr1514275.aspx?art=1");
  assert.equal(mapTourSummary({ info: { standings: "javascript:alert(1)" } }).standingsUrl, undefined);
  const [row] = mapTourPlayers([{
    ...players[0],
    ratingsMap: { standard: 1883, rapid: 1730 },
    ratingDiffs: { standard: 24, rapid: 0 },
    performances: { standard: 2441 },
  }], tour.fideTimeControl);
  assert.equal(row?.rating, 1730);
  assert.equal(row?.ratingDiff, 0);
  assert.equal(row?.performance, null);
});

test("matches FIDE ID first and falls back to exact name", () => {
  const rows = mapTourPlayers(players);
  assert.equal(findStandingRow(rows, { fideId: 8688672, name: rows[1]!.name }), rows[0]);
  assert.equal(findStandingRow(rows, { fideId: -1, name: rows[1]!.name }), rows[1]);
  assert.equal(findStandingRow(rows, { fideId: null, name: rows[1]!.name }), rows[1]);
  assert.equal(findStandingRow(rows, { name: "sun, yunjin" }), undefined);
});
