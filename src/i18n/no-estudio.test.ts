import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const I18N_DIR = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_ESTUDIO = /\best[uú]dio\b/i;

test("pt-br and i18n string tables always use 'Studio' instead of 'Estúdio'", () => {
  const stringFiles = fs
    .readdirSync(I18N_DIR)
    .filter((name) => name === "strings.ts" || name.endsWith("-strings.ts"))
    .sort();

  assert.ok(stringFiles.length > 0, "Expected the string tables in src/i18n");

  for (const fileName of stringFiles) {
    const content = fs.readFileSync(path.join(I18N_DIR, fileName), "utf8");
    const match = content.match(FORBIDDEN_ESTUDIO);
    assert.equal(
      match,
      null,
      `${fileName} contains "${match?.[0]}" — use "Studio" instead of "Estúdio" in UI copy`,
    );
  }
});
