import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n");

const tables = [
  ...new Set(
    [...sql.matchAll(/create\s+table\s+(if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)].map(
      (match) => match[2].toLowerCase(),
    ),
  ),
];

describe("rls all tables contract", () => {
  it("finds at least one public table in the migrations", () => {
    assert.ok(tables.length > 0, "expected at least one create table public.* in supabase/migrations");
  });

  for (const table of tables) {
    it(`table public.${table} enables row level security`, () => {
      assert.ok(
        new RegExp(
          `alter\\s+table\\s+(if\\s+exists\\s+)?public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
          "i",
        ).test(sql),
        `table public.${table} has no ENABLE ROW LEVEL SECURITY in supabase/migrations`,
      );
    });

    it(`table public.${table} declares at least one policy`, () => {
      assert.ok(
        new RegExp(`create\\s+policy\\b[\\s\\S]*?on\\s+public\\.${table}\\b`, "i").test(sql),
        `table public.${table} has no CREATE POLICY in supabase/migrations`,
      );
    });
  }
});
