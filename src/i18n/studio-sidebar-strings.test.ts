import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { STUDIO_SIDEBAR_STRING_KEYS, TABLES, tSidebar } from "./studio-sidebar-strings.ts";

test("studio sidebar string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
});

test("every studio sidebar string key renders non-empty in both locales", () => {
  const keys = new Set<string>(STUDIO_SIDEBAR_STRING_KEYS);
  assert.equal(keys.size, STUDIO_SIDEBAR_STRING_KEYS.length, "studio sidebar string keys must be unique");
  for (const key of STUDIO_SIDEBAR_STRING_KEYS) {
    assert.ok(tSidebar("en", key).length > 0, `en:${key} must not be empty`);
    assert.ok(tSidebar("pt-br", key).length > 0, `pt-br:${key} must not be empty`);
  }
});

test("studio sidebar interpolated strings render whole sentences with vars", () => {
  assert.equal(tSidebar("en", "sidebar.databases.sources.other", { count: 3 }), "3 sources");
  assert.equal(
    tSidebar("pt-br", "sidebar.databases.sources.other", { count: 3 }),
    "3 fontes",
  );
  assert.equal(tSidebar("en", "sidebar.databases.sources.one", { count: 1 }), "1 source");
  assert.equal(tSidebar("pt-br", "sidebar.databases.sources.one", { count: 1 }), "1 fonte");
  assert.equal(
    tSidebar("en", "sidebar.files.moveFolder", { name: "Openings" }),
    'Move folder "Openings"',
  );
  assert.equal(
    tSidebar("pt-br", "sidebar.files.moveFolder", { name: "Aberturas" }),
    'Mover pasta "Aberturas"',
  );
  assert.equal(tSidebar("pt-br", "sidebar.boards.keepName", { title: "Xadrez" }), "Manter Xadrez");
});
