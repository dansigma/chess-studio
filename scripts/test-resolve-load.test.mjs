import assert from "node:assert/strict";
import test from "node:test";
import { formatForFallback, loadWithCjsFallback } from "./test-resolve.mjs";

// SIG-1181: guards the `load`-hook hardening in `test-resolve.mjs` against
// `ERR_INVALID_RETURN_PROPERTY_VALUE` on Node 22.18–22.20. Registering ANY
// `load` hook forces strict sync validation of every chained result there,
// and Node's own default CJS load settles `source: null` — rejected the
// moment a hook passes it through. The hook therefore re-reads those files
// itself; these tests pin the real hook path (`loadWithCjsFallback`).

test("loadWithCjsFallback passes successful loads through untouched", () => {
  const sentinel = { format: "module", source: "export {};" };
  assert.equal(
    loadWithCjsFallback("file:///x.ts", {}, () => sentinel),
    sentinel,
  );
});

test("loadWithCjsFallback rethrows non-validation errors", () => {
  const boom = new Error("nope");
  assert.throws(
    () =>
      loadWithCjsFallback("file:///x.js", {}, () => {
        throw boom;
      }),
    (error) => error === boom,
  );
  const other = Object.assign(new Error("denied"), { code: "ERR_ACCESS_DENIED" });
  assert.throws(
    () =>
      loadWithCjsFallback("file:///x.js", {}, () => {
        throw other;
      }),
    (error) => error === other,
  );
  // Non-file URLs (e.g. `node:` builtins) never hit the file fallback.
  const builtinFailure = Object.assign(new Error("null source"), {
    code: "ERR_INVALID_RETURN_PROPERTY_VALUE",
  });
  assert.throws(
    () =>
      loadWithCjsFallback("node:test", {}, () => {
        throw builtinFailure;
      }),
    (error) => error === builtinFailure,
  );
});

test("loadWithCjsFallback re-reads the file on null-source validation failure", () => {
  const url = new URL("./test-resolve.mjs", import.meta.url).href;
  const failure = Object.assign(
    new Error('Expected a string to be returned for the "source" but got null'),
    { code: "ERR_INVALID_RETURN_PROPERTY_VALUE" },
  );
  const result = loadWithCjsFallback(url, {}, () => {
    throw failure;
  });
  assert.equal(result.format, "module");
  assert.equal(result.shortCircuit, true);
  assert.match(result.source, /loadWithCjsFallback/);
});

test("formatForFallback mirrors Node defaults", () => {
  assert.equal(formatForFallback("file:///repo/pkg/mod.mjs"), "module");
  assert.equal(formatForFallback("file:///repo/pkg/mod.cjs"), "commonjs");
  assert.equal(formatForFallback("file:///repo/pkg/data.json"), "json");
  // chess.js ships no `exports` map and no `"type": "module"`: CommonJS.
  assert.equal(
    formatForFallback(new URL("../node_modules/chess.js/dist/cjs/chess.js", import.meta.url).href),
    "commonjs",
  );
  // This repo is ESM (`"type": "module"`): plain `.js` resolves as module.
  assert.equal(formatForFallback(new URL("./test-resolve-load.test.mjs", import.meta.url).href), "module");
});
