import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MOBILE_MAX_WIDTH, mobileQuery } from "./use-is-mobile.ts";

describe("mobile breakpoint (SIG-1043)", () => {
  test("exports the 767 px single source of truth", () => {
    assert.equal(MOBILE_MAX_WIDTH, 767);
  });

  test("builds the max-width media query from the constant", () => {
    assert.equal(mobileQuery(), "(max-width: 767px)");
    assert.equal(mobileQuery(MOBILE_MAX_WIDTH), "(max-width: 767px)");
  });

  test("accepts an explicit width override", () => {
    assert.equal(mobileQuery(500), "(max-width: 500px)");
  });
});
