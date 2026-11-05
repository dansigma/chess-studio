import assert from "node:assert/strict";
import test from "node:test";
import { dayStreak, localDayKey, mergeDays, normalizeDays, recordActivity } from "./activity";
import { applyResult, emptyProgress, normalizeProgress } from "./engine";
import { mergePuzzleProgress } from "./progress";
import type { DayActivity } from "./types";

const day = (n = 1): DayActivity => ({ solved: n, failed: 0, ms: 1000, xp: 10 });
const mk = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, day()]));

// 2026-11-05 is a Thursday; weeks start Sunday (Nov 1).
test("localDayKey uses the user's time zone, not UTC", () => {
  const t = Date.UTC(2026, 10, 6, 2, 0); // 23:00 on Nov 5 in Sao Paulo (UTC-3)
  assert.equal(localDayKey(t, "America/Sao_Paulo"), "2026-11-05");
  assert.equal(localDayKey(t, "UTC"), "2026-11-06");
  assert.equal(localDayKey(Date.UTC(2026, 10, 6, 3, 0), "America/Sao_Paulo"), "2026-11-06");
  assert.equal(localDayKey(t, "Asia/Tokyo"), "2026-11-06");
});

test("recordActivity counts into the local day and accumulates", () => {
  const t = Date.UTC(2026, 10, 6, 2, 0);
  let p = recordActivity(emptyProgress(), { now: t, success: true, ms: 1500, xp: 20, timeZone: "America/Sao_Paulo" });
  p = recordActivity(p, { now: t, success: false, ms: null, xp: 0, timeZone: "America/Sao_Paulo" });
  assert.deepEqual(p.days, { "2026-11-05": { solved: 1, failed: 1, ms: 1500, xp: 20 } });
});

test("applyResult records activity in every mode", () => {
  const now = Date.now();
  for (const mode of ["rated", "streak", "rush", "daily", "mistakes"] as const) {
    const next = applyResult(emptyProgress(), {
      id: "p1", mode, success: true, puzzleRating: 1200, sessionScore: 1, now, themes: [], ms: 700,
    });
    const d = next.days[localDayKey(now)];
    assert.equal(d.solved, 1, mode);
    assert.equal(d.ms, 700, mode);
    assert.equal(d.xp > 0, mode !== "mistakes", mode);
  }
});

test("old progress without days normalizes to {} and keeps working", () => {
  const legacy: Record<string, unknown> = { ...emptyProgress() };
  delete legacy.days;
  assert.deepEqual(normalizeProgress(legacy).days, {});
  assert.deepEqual(normalizeProgress({ ...legacy, days: "junk" }).days, {});
  assert.deepEqual(normalizeDays({ bad: day(), "2026-01-01": { solved: -3, failed: "x" } }), {
    "2026-01-01": { solved: 0, failed: 0, ms: 0, xp: 0 },
  });
});

test("only the newest 400 days are kept", () => {
  const many: Record<string, DayActivity> = {};
  for (let i = 0; i < 450; i++) {
    many[new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)] = day();
  }
  const kept = Object.keys(normalizeDays(many));
  assert.equal(kept.length, 400);
  assert.equal(kept[0], new Date(Date.UTC(2025, 0, 51)).toISOString().slice(0, 10));
});

test("merge takes per-day max (no double counting) and is idempotent", () => {
  const a = { "2026-11-05": { solved: 3, failed: 1, ms: 5000, xp: 30 } };
  const b = { "2026-11-05": { solved: 2, failed: 2, ms: 9000, xp: 20 }, "2026-11-04": day() };
  const m = mergeDays(a, b);
  assert.deepEqual(m["2026-11-05"], { solved: 3, failed: 2, ms: 9000, xp: 30 });
  assert.deepEqual(mergeDays(a, a), a);
  assert.deepEqual(mergeDays(m, m), m);
  // Same state from two devices
  const p = { ...emptyProgress(), days: a };
  assert.deepEqual(mergePuzzleProgress(p, p).days, a);
  const merged = mergePuzzleProgress(p, { ...emptyProgress(), days: b });
  assert.deepEqual(mergePuzzleProgress(merged, merged).days, merged.days);
});

test("streak without a missed day", () => {
  const s = dayStreak(mk("2026-11-03", "2026-11-04", "2026-11-05"), "2026-11-05");
  assert.deepEqual(s, { current: 3, longest: 3, frozenDays: [] });
});

test("today not yet played does not break the streak", () => {
  const s = dayStreak(mk("2026-11-03", "2026-11-04"), "2026-11-05");
  assert.equal(s.current, 2);
  assert.deepEqual(s.frozenDays, []);
});

test("one missed day per week is frozen, a second breaks", () => {
  // Nov 1 Sun .. Nov 7 Sat. Miss Mon Nov 2 only.
  const one = dayStreak(mk("2026-11-01", "2026-11-03", "2026-11-04"), "2026-11-04");
  assert.deepEqual(one, { current: 3, longest: 3, frozenDays: ["2026-11-02"] });
  // Miss Mon and Wed in the same week.
  const two = dayStreak(mk("2026-11-01", "2026-11-03", "2026-11-05"), "2026-11-05");
  assert.equal(two.current, 1);
  assert.equal(two.longest, 2);
  // SIG-1233: the Wednesday miss broke the run, so Monday's freeze saved nothing.
  assert.deepEqual(two.frozenDays, []);
});

test("freeze resets each calendar week (Sunday start)", () => {
  // Sat Oct 31 missed (week of Oct 25), Mon Nov 2 missed (week of Nov 1).
  const s = dayStreak(mk("2026-10-30", "2026-11-01", "2026-11-03"), "2026-11-03");
  assert.equal(s.current, 3);
  assert.deepEqual(s.frozenDays, ["2026-10-31", "2026-11-02"]);
});

test("yesterday frozen keeps streak alive while today is unplayed; a second miss breaks it", () => {
  const frozen = dayStreak(mk("2026-11-02", "2026-11-03"), "2026-11-05");
  assert.equal(frozen.current, 2);
  assert.deepEqual(frozen.frozenDays, ["2026-11-04"]);
  const broken = dayStreak(mk("2026-11-02"), "2026-11-05");
  assert.equal(broken.current, 0);
  assert.equal(broken.longest, 1);
});

test("no activity", () => {
  assert.deepEqual(dayStreak({}, "2026-11-05"), { current: 0, longest: 0, frozenDays: [] });
  assert.equal(dayStreak({ "2026-11-05": { solved: 0, failed: 0, ms: 5, xp: 0 } }, "2026-11-05").current, 0);
});

test("a freeze in a run that a later miss in the same week breaks is discarded", () => {
  // Sun Nov 1 played, Mon Nov 2 missed (would freeze), Tue Nov 3 missed (reset).
  const s = dayStreak(mk("2026-11-01", "2026-11-04"), "2026-11-04");
  assert.equal(s.current, 1);
  assert.equal(s.longest, 1);
  assert.ok(!s.frozenDays.includes("2026-11-02"));
  assert.deepEqual(s.frozenDays, []);
});

test("freezes of the live run survive an earlier broken run", () => {
  // Run 1: Sun Oct 18 only, then Oct 19-31 missed (reset). Run 2: Sun Nov 1,
  // Mon Nov 2 missed (frozen), Tue Nov 3 played.
  const s = dayStreak(mk("2026-10-18", "2026-11-01", "2026-11-03"), "2026-11-03");
  assert.equal(s.current, 2);
  assert.equal(s.longest, 2);
  assert.deepEqual(s.frozenDays, ["2026-11-02"]);
});
