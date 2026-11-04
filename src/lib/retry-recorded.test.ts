import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";

before(() => setupDom());
after(() => teardownDom());

const { RETRY_RECORDED_KEY } = await import("./local-cache.ts");
const { localDateKey, markRetryRecorded, retryRecordedToday } = await import("./retry-recorded.ts");

beforeEach(() => window.localStorage.clear());

describe("retry-recorded", () => {
  it("uses the local calendar date, not UTC", () => {
    assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
    assert.equal(localDateKey(new Date(2026, 11, 31, 0, 1)), "2026-12-31");
  });

  it("remembers a key for the rest of the day only", () => {
    const morning = new Date(2026, 5, 1, 8, 0);
    assert.equal(retryRecordedToday("mx:a", morning), false);
    markRetryRecorded("mx:a", morning);
    assert.equal(retryRecordedToday("mx:a", new Date(2026, 5, 1, 23, 30)), true);
    assert.equal(retryRecordedToday("mx:b", morning), false);
    assert.equal(retryRecordedToday("mx:a", new Date(2026, 5, 2, 0, 5)), false);
  });

  it("drops other days' entries when writing", () => {
    markRetryRecorded("mx:old", new Date(2026, 5, 1, 8, 0));
    markRetryRecorded("mx:new", new Date(2026, 5, 2, 8, 0));
    const stored = JSON.parse(window.localStorage.getItem(RETRY_RECORDED_KEY) ?? "{}");
    assert.deepEqual(stored, { "mx:new": "2026-06-02" });
  });

  it("survives a corrupt value", () => {
    window.localStorage.setItem(RETRY_RECORDED_KEY, "[1,2");
    assert.equal(retryRecordedToday("mx:a"), false);
    window.localStorage.setItem(RETRY_RECORDED_KEY, '["x"]');
    assert.equal(retryRecordedToday("mx:a"), false);
  });
});
