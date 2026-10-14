import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "./sidebar-width.ts";

test("clampSidebarWidth preserves values within normal range", () => {
  assert.equal(clampSidebarWidth(256), 256);
  assert.equal(clampSidebarWidth(160), 160);
  assert.equal(clampSidebarWidth(480), 480);
  assert.equal(clampSidebarWidth(320), 320);
});

test("clampSidebarWidth clamps values below MIN_SIDEBAR_WIDTH", () => {
  assert.equal(clampSidebarWidth(100), MIN_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(0), MIN_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(-50), MIN_SIDEBAR_WIDTH);
});

test("clampSidebarWidth clamps values above MAX_SIDEBAR_WIDTH", () => {
  assert.equal(clampSidebarWidth(500), MAX_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(1000), MAX_SIDEBAR_WIDTH);
});

test("clampSidebarWidth caps upper bound by viewport width ratio (40%)", () => {
  // 1000px viewport * 0.4 = 400px maximum
  assert.equal(clampSidebarWidth(450, 1000), 400);
  assert.equal(clampSidebarWidth(300, 1000), 300);

  // Even if 40% of viewport is small, min width is protected
  // 300px viewport * 0.4 = 120px, but min width is 160px
  assert.equal(clampSidebarWidth(100, 300), MIN_SIDEBAR_WIDTH);
});

test("clampSidebarWidth falls back to DEFAULT_SIDEBAR_WIDTH for invalid numbers", () => {
  assert.equal(clampSidebarWidth(NaN), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(Infinity), DEFAULT_SIDEBAR_WIDTH);
  assert.equal(clampSidebarWidth(-Infinity), DEFAULT_SIDEBAR_WIDTH);
  // @ts-expect-error test non-number runtime argument
  assert.equal(clampSidebarWidth("invalid"), DEFAULT_SIDEBAR_WIDTH);
  // @ts-expect-error test undefined runtime argument
  assert.equal(clampSidebarWidth(undefined), DEFAULT_SIDEBAR_WIDTH);
});
