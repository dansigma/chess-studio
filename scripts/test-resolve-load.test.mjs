import assert from "node:assert/strict";
import test from "node:test";
import { isNullSourceResult } from "./test-resolve.mjs";

// SIG-1181: guards the `load`-hook hardening in `test-resolve.mjs` against
// `ERR_INVALID_RETURN_PROPERTY_VALUE` ("load hook but got null") on Node 22.
// Only explicit null-source results are flagged; `undefined` (source crossing
// threads, e.g. `.ts` type stripping) and promises must pass through — the
// source value is not cloneable off-thread and re-wrapping it breaks loading
// (proven by chess.js `format: commonjs` named-export breakage).
test("isNullSourceResult flags only explicit null sources", () => {
  assert.equal(isNullSourceResult({ format: "module", source: null, shortCircuit: true }), true);
  assert.equal(isNullSourceResult({ format: "module", source: "", shortCircuit: true }), false);
  assert.equal(isNullSourceResult({ format: "module", source: "export {};" }), false);
  assert.equal(isNullSourceResult({ format: "module", source: undefined }), false);
  assert.equal(isNullSourceResult({ format: "module" }), false);
  assert.equal(isNullSourceResult(Promise.resolve({ source: null })), false);
  assert.equal(isNullSourceResult(null), false);
  assert.equal(isNullSourceResult(undefined), false);
  assert.equal(isNullSourceResult("module"), false);
});
