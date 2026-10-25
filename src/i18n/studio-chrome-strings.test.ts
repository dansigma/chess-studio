import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { STUDIO_CHROME_STRING_KEYS, TABLES, tStudioChrome } from "./studio-chrome-strings.ts";

test("studio chrome string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every studio chrome string key renders non-empty in both locales", () => {
  const keys = new Set<string>(STUDIO_CHROME_STRING_KEYS);
  assert.equal(keys.size, STUDIO_CHROME_STRING_KEYS.length, "studio chrome string keys must be unique");
  for (const key of STUDIO_CHROME_STRING_KEYS) {
    assert.ok(tStudioChrome("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tStudioChrome("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("my games activity title is translated", () => {
  assert.equal(tStudioChrome("en", "chrome.activity.mygames"), "My Games");
  const ptBr = tStudioChrome("pt-br", "chrome.activity.mygames");
  assert.ok(ptBr.length > 0, "pt-br:chrome.activity.mygames must not be empty");
  assert.notEqual(ptBr, tStudioChrome("en", "chrome.activity.mygames"));
});

test("studio chrome interpolated strings render whole sentences with vars", () => {
  assert.equal(
    tStudioChrome("en", "chrome.account.waitingToSync.other", { count: 3 }),
    "3 boards waiting to sync",
  );
  assert.equal(
    tStudioChrome("pt-br", "chrome.account.waitingToSync.other", { count: 3 }),
    "3 tabuleiros aguardando sincronização",
  );
  assert.equal(tStudioChrome("en", "chrome.statusBar.threads.other", { count: 4 }), "4 threads");
  assert.equal(tStudioChrome("pt-br", "chrome.statusBar.threads.other", { count: 4 }), "4 threads");
  assert.equal(
    tStudioChrome("pt-br", "chrome.menu.aboutSite", { site: "Chess Studio" }),
    "Sobre Chess Studio",
  );
});
