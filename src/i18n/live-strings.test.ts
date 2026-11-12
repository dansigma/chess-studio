import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_STRING_KEYS, tLive } from "./live-strings.ts";

test("every key resolves in en and pt-br", () => {
  for (const key of LIVE_STRING_KEYS) {
    assert.ok(tLive("en", key).length > 0);
    assert.ok(tLive("pt-br", key).length > 0);
  }
});

test("interpolates variables", () => {
  assert.equal(tLive("en", "live.item.startsAt", { date: "Nov 12" }), "Starts Nov 12");
  assert.equal(tLive("pt-br", "live.section.past"), "Encerrados");
});
