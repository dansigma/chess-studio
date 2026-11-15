import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { digitsOnly, eloInputText, hmFromMinutes, minutesFromHm, parseEloInput } from "./duration-input.ts";

describe("duration input", () => {
  it("converts hours and minutes to minutes", () => {
    assert.equal(minutesFromHm("2", "30"), 150);
    assert.equal(minutesFromHm("", "45"), 45);
    assert.equal(minutesFromHm("1", ""), 60);
    assert.equal(minutesFromHm("", ""), null);
    assert.equal(minutesFromHm("0", "0"), 0);
  });
  it("splits minutes into hours and minutes", () => {
    assert.deepEqual(hmFromMinutes(150), { hours: "2", minutes: "30" });
    assert.deepEqual(hmFromMinutes(45), { hours: "0", minutes: "45" });
    assert.deepEqual(hmFromMinutes(null), { hours: "", minutes: "" });
  });
  it("round-trips", () => {
    for (const total of [1, 59, 60, 61, 20000]) {
      const { hours, minutes } = hmFromMinutes(total);
      assert.equal(minutesFromHm(hours, minutes), total);
    }
  });
  it("parses Elo text", () => {
    assert.equal(parseEloInput(""), null);
    assert.equal(parseEloInput("1200"), 1200);
    assert.equal(parseEloInput("12a0"), 120);
    assert.equal(eloInputText(null), "");
    assert.equal(eloInputText(900), "900");
    assert.equal(digitsOnly("a1-2"), "12");
  });
});
