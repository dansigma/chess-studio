import { test } from "node:test";
import assert from "node:assert/strict";
import { getFieldSupport, limitedSourceLabels, type SupportSource } from "./filter-support";
import type { LibrarySourceCapabilities } from "@/src/lib/library/types";

const FULL: LibrarySourceCapabilities = {
  textSearch: "full", color: "full", result: "full", annotations: "full", position: "full", sort: "full", maxResults: null,
};
const src = (label: string, over: Partial<LibrarySourceCapabilities> = {}): SupportSource => ({
  label,
  capabilities: { ...FULL, ...over },
});

test("full support: enabled, no notes", () => {
  const s = getFieldSupport("color", [src("A")]);
  assert.deepEqual(s, { disabled: false, partial: [], none: [] });
});

test("mixed support lists partial and none sources, stays enabled", () => {
  const s = getFieldSupport("annotations", [src("A"), src("M", { annotations: "partial" }), src("F", { annotations: "none" })]);
  assert.equal(s.disabled, false);
  assert.deepEqual(s.partial, ["M"]);
  assert.deepEqual(s.none, ["F"]);
});

test("disabled only when every selected source has none", () => {
  assert.equal(getFieldSupport("annotations", [src("M", { annotations: "none" })]).disabled, true);
  assert.equal(getFieldSupport("annotations", [src("M", { annotations: "partial" })]).disabled, false);
});

test("opponent uses the textSearch capability", () => {
  assert.equal(getFieldSupport("opponent", [src("M", { textSearch: "none" })]).disabled, true);
  assert.deepEqual(limitedSourceLabels("textSearch", [src("A"), src("M", { textSearch: "partial" })]), ["M"]);
});
