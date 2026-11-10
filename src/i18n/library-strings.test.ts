import { test } from "node:test";
import assert from "node:assert/strict";
import { LIBRARY_STRING_KEYS, tLibrary } from "./library-strings.ts";

test("every key resolves in en and pt-br", () => {
  for (const key of LIBRARY_STRING_KEYS) {
    assert.ok(tLibrary("en", key).length > 0);
    assert.ok(tLibrary("pt-br", key).length > 0);
  }
});

test("interpolates variables", () => {
  assert.equal(tLibrary("en", "library.total", { count: 3 }), "3 games");
  assert.equal(tLibrary("pt-br", "library.total", { count: 3 }), "3 partidas");
});
