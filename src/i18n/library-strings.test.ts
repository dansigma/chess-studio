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
  assert.equal(tLibrary("en", "library.total.other", { count: 3 }), "3 games");
  assert.equal(tLibrary("pt-br", "library.total.other", { count: 3 }), "3 partidas");
});

test("counts have a singular form in both locales", () => {
  assert.equal(tLibrary("en", "library.total.one", { count: 1 }), "1 game");
  assert.equal(tLibrary("pt-br", "library.total.one", { count: 1 }), "1 partida");
  assert.equal(tLibrary("en", "library.sources.games.one", { count: 1 }), "1 game");
  assert.equal(tLibrary("pt-br", "library.sources.games.one", { count: 1 }), "1 partida");
  assert.equal(tLibrary("en", "library.dossier.games.one", { count: 1 }), "1 game");
  assert.equal(tLibrary("pt-br", "library.dossier.games.one", { count: 1 }), "1 partida");
});
