import assert from "node:assert/strict";
import test from "node:test";
import { assertStringTablesAligned } from "../test-utils/i18n.ts";
import { TABLES, tAskMaster } from "./ask-master-strings.ts";

test("Ask the Master string tables are aligned across locales", () => {
  assertStringTablesAligned(TABLES.en, TABLES["pt-br"]);
  for (const table of Object.values(TABLES)) {
    for (const value of Object.values(table)) assert.ok(value.trim());
  }
  assert.equal(tAskMaster("pt-br", "remaining", { count: 3 }), "3 perguntas restantes hoje");
  assert.equal(tAskMaster("en", "remainingOne", { count: 1 }), "1 question left today");
});
