import assert from "node:assert/strict";
import test from "node:test";
import { emptyProgress, normalizeProgress } from "./engine.ts";
import { motifSummary, weakestMotif } from "./motif-stats.ts";
import type { MotifStat, PuzzleProgress } from "./types.ts";

function progressWith(motifs: Record<string, MotifStat>): PuzzleProgress {
  return normalizeProgress({ ...emptyProgress(), motifs });
}

function stat(overrides: Partial<MotifStat>): MotifStat {
  const base: MotifStat = {
    attempts: 0,
    solved: 0,
    timedAttempts: 0,
    totalMs: 0,
    recent: "",
    ...overrides,
  };
  return { ...base, recent: base.recent.slice(-10) };
}

test("motifSummary sorts by attempts desc and computes success, avg time and trend", () => {
  const rows = motifSummary(
    progressWith({
      fork: stat({ attempts: 12, solved: 9, timedAttempts: 12, totalMs: 96_000, recent: "1111111111" }),
      pin: stat({ attempts: 10, solved: 2, timedAttempts: 4, totalMs: 20_000, recent: "0000000000" }),
      skewer: stat({ attempts: 9, solved: 9, timedAttempts: 0, totalMs: 0, recent: "111111111" }),
    }),
  );
  assert.deepEqual(
    rows.map((row) => row.theme),
    ["fork", "pin", "skewer"],
  );
  assert.equal(rows[0]?.successPct, 75);
  assert.equal(rows[0]?.avgSeconds, 8);
  assert.equal(rows[0]?.trend, "up");
  assert.equal(rows[1]?.successPct, 20);
  assert.equal(rows[1]?.avgSeconds, 5);
  assert.equal(rows[1]?.trend, "down");
  // No timed attempts: average time is unknown.
  assert.equal(rows[2]?.avgSeconds, null);
});

test("trend boundary of exactly ten points is flat and empty recent is null", () => {
  // 8/10 all-time (80%), recent 9/10 (90%): diff is exactly +10 -> flat.
  const flat = motifSummary(
    progressWith({ fork: stat({ attempts: 10, solved: 8, recent: "1111111110" }) }),
  );
  assert.equal(flat[0]?.trend, "flat");
  const empty = motifSummary(progressWith({ fork: stat({ attempts: 3, solved: 2, recent: "" }) }));
  assert.equal(empty[0]?.trend, null);
});

test("weakestMotif ignores themes under the threshold and breaks ties deterministically", () => {
  const progress = progressWith({
    fork: stat({ attempts: 12, solved: 6, recent: "101010101010" }),
    pin: stat({ attempts: 10, solved: 2, recent: "0000000000" }),
    // Under threshold despite a worse rate.
    skewer: stat({ attempts: 9, solved: 0, recent: "000000000" }),
  });
  assert.equal(weakestMotif(progress), "pin");
  assert.equal(weakestMotif(progress, 13), null);
  assert.equal(weakestMotif(emptyProgress()), null);

  // Tie on rate: more attempts wins; full tie: theme id asc wins.
  const tied = progressWith({
    fork: stat({ attempts: 10, solved: 5, recent: "1010101010" }),
    pin: stat({ attempts: 12, solved: 6, recent: "101010101010" }),
  });
  assert.equal(weakestMotif(tied), "pin");
  const fullTie = progressWith({
    pin: stat({ attempts: 10, solved: 5, recent: "1010101010" }),
    fork: stat({ attempts: 10, solved: 5, recent: "1010101010" }),
  });
  assert.equal(weakestMotif(fullTie), "fork");
});
