import assert from "node:assert/strict";
import test from "node:test";
import { clockToken, formatClockMs, parseClockMs } from "./clock.ts";

test("parseClockMs reads h:mm:ss, tenths and short forms", () => {
  assert.equal(parseClockMs("0:09:57"), 597_000);
  assert.equal(parseClockMs("0:00:09.8"), 9_800);
  assert.equal(parseClockMs("1:00:00"), 3_600_000);
  assert.equal(parseClockMs("9:57"), 597_000);
  assert.equal(parseClockMs("0:00:00"), 0);
});

test("parseClockMs rejects junk instead of inventing a clock", () => {
  assert.equal(parseClockMs(undefined), undefined);
  assert.equal(parseClockMs(""), undefined);
  assert.equal(parseClockMs("abc"), undefined);
  assert.equal(parseClockMs(12), undefined);
});

test("formatClockMs round-trips and only shows tenths when present", () => {
  assert.equal(formatClockMs(597_000), "0:09:57");
  assert.equal(formatClockMs(9_800), "0:00:09.8");
  assert.equal(formatClockMs(0), "0:00:00");
  assert.equal(formatClockMs(undefined), undefined);
  assert.equal(formatClockMs(-5), undefined);
  assert.equal(clockToken(597_000), "[%clk 0:09:57]");
  assert.equal(clockToken(undefined), undefined);
});
