import assert from "node:assert/strict";
import test from "node:test";
import { formatDateTime, formatDecimal1, formatDuration, formatGameCount, formatInteger } from "./format.ts";

test("formatDecimal1 renders one decimal with the locale separator", () => {
  assert.equal(formatDecimal1("en", 86), "86.0");
  assert.equal(formatDecimal1("pt-br", 86), "86,0");
});

test("formatInteger groups thousands per locale, leaves small counts bare", () => {
  assert.equal(formatInteger("en", 2450), "2,450");
  assert.equal(formatInteger("pt-br", 2450), "2.450");
  assert.equal(formatInteger("en", 12), "12");
  assert.equal(formatInteger("pt-br", 12), "12");
  assert.equal(formatInteger("en", 3), "3");
  assert.equal(formatInteger("pt-br", 20), "20");
});

test("formatGameCount is exact below 10,000 and compact above, per locale", () => {
  assert.equal(formatGameCount("en", 1336), "1,336");
  assert.equal(formatGameCount("pt-br", 1336), "1.336");
  assert.equal(formatGameCount("en", 895), "895");
  assert.equal(formatGameCount("en", 12345), "12.3K");
  assert.match(formatGameCount("pt-br", 12345), /^12,3\s?mil$/u);
});

test("formatDuration: ms under a second, tenths under a minute, minutes and seconds above", () => {
  assert.equal(formatDuration("en", 640), "640ms");
  assert.equal(formatDuration("en", 0), "0ms");
  assert.equal(formatDuration("en", 999.6), "999ms");
  assert.equal(formatDuration("en", 1300), "1.3s");
  assert.equal(formatDuration("pt-br", 1300), "1,3s");
  assert.equal(formatDuration("en", 28000), "28.0s");
  assert.equal(formatDuration("en", 72000), "1m 12s");
  assert.equal(formatDuration("pt-br", 72400), "1m 12s");
  assert.equal(formatDuration("en", 59960), "1m 0s");
  assert.equal(formatDuration("en", 3_725_000), "62m 5s");
  assert.equal(formatDuration("en", -5), "0ms");
});

test("formatDateTime renders day, month and time per locale and timezone", () => {
  const ms = Date.UTC(2026, 10, 12, 15, 30);
  const en = formatDateTime("en", ms, "UTC");
  const pt = formatDateTime("pt-br", ms, "UTC");
  assert.match(en, /Nov/u);
  assert.match(en, /12/u);
  assert.match(en, /3:30\s?PM/u);
  assert.match(pt, /12/u);
  assert.match(pt, /nov/iu);
  assert.match(pt, /15:30/u);
  assert.match(formatDateTime("en", ms, "America/Sao_Paulo"), /12:30\s?PM/u);
});
