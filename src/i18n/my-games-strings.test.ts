// SIG-1089: My Games strings alignment + bar/panel agreement. Missing
// PT-BR keys fail `tsc`; the title-equality assertion keeps the activity bar
// (`chrome.activity.mygames`) and the panel (`myGames.title`) in sync.
import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { tStudioChrome } from "./studio-chrome-strings.ts";
import { MY_GAMES_STRING_KEYS, TABLES, tMyGames } from "./my-games-strings.ts";

test("my games string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every my games string key renders non-empty in both locales", () => {
  const keys = new Set<string>(MY_GAMES_STRING_KEYS);
  assert.equal(keys.size, MY_GAMES_STRING_KEYS.length, "my games string keys must be unique");
  for (const key of MY_GAMES_STRING_KEYS) {
    assert.ok(tMyGames("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tMyGames("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("my games sidebar title matches the activity bar title", () => {
  assert.equal(tMyGames("en", "myGames.title"), tStudioChrome("en", "chrome.activity.mygames"));
  assert.equal(tMyGames("pt-br", "myGames.title"), tStudioChrome("pt-br", "chrome.activity.mygames"));
});

test("my games plural sync strings interpolate the count", () => {
  assert.equal(tMyGames("en", "myGames.synced.one", { count: 1 }), "Synced 1 new game");
  assert.equal(tMyGames("en", "myGames.synced.other", { count: 3 }), "Synced 3 new games");
  assert.equal(
    tMyGames("pt-br", "myGames.synced.one", { count: 1 }),
    "Sincronizada 1 nova partida",
  );
});
