import assert from "node:assert/strict";
import { test } from "node:test";
import { isTextSize, textSizeAttr } from "./text-size.ts";

test("isTextSize accepts only the three sizes", () => {
  for (const ok of ["small", "default", "large"]) assert.equal(isTextSize(ok), true);
  for (const bad of ["huge", "", null, undefined, 12]) assert.equal(isTextSize(bad), false);
});

test("textSizeAttr omits the attribute for default", () => {
  assert.equal(textSizeAttr("default"), undefined);
  assert.equal(textSizeAttr("small"), "small");
  assert.equal(textSizeAttr("large"), "large");
});
