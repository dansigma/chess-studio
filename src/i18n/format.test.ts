import assert from "node:assert/strict";
import test from "node:test";
import { formatDecimal1, formatGameCount, formatInteger } from "./format.ts";

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
