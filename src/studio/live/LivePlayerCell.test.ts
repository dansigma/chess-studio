import assert from "node:assert/strict";
import { test } from "node:test";
import { titleTone } from "./LivePlayerCell.tsx";

test("title badges: GM stands out, IM and WGM get the accent, other titles stay neutral", () => {
  assert.equal(titleTone("GM"), "strong");
  assert.equal(titleTone("IM"), "accent");
  assert.equal(titleTone("WGM"), "accent");
  assert.equal(titleTone("FM"), "neutral");
  assert.equal(titleTone("wim"), "neutral");
});
