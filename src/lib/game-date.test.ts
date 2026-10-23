import assert from "node:assert/strict";
import test from "node:test";
import { formatTimeClass, formatYearMonth } from "./game-date.ts";

test("formats year and month as YYYY.MM", () => {
  assert.equal(formatYearMonth(2024, 3), "2024.03");
  assert.equal(formatYearMonth(1997, 12), "1997.12");
});

test("falls back to year when month is missing", () => {
  assert.equal(formatYearMonth(2024, null), "2024");
  assert.equal(formatYearMonth(2024, undefined), "2024");
});

test("falls back to year when month is invalid", () => {
  assert.equal(formatYearMonth(2024, 0), "2024");
  assert.equal(formatYearMonth(2024, 13), "2024");
  assert.equal(formatYearMonth(2024, 2.5), "2024");
  assert.equal(formatYearMonth(2024, Number.NaN), "2024");
});

test("returns empty string when year is missing", () => {
  assert.equal(formatYearMonth(null, 3), "");
  assert.equal(formatYearMonth(undefined, 3), "");
  assert.equal(formatYearMonth(Number.NaN, 3), "");
  assert.equal(formatYearMonth(2024.5, 3), "");
});

test("capitalizes the time class and blanks missing values", () => {
  assert.equal(formatTimeClass("blitz"), "Blitz");
  assert.equal(formatTimeClass("daily"), "Daily");
  assert.equal(formatTimeClass(null), "");
  assert.equal(formatTimeClass(undefined), "");
});
