import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../supabase/migrations/20261021220000_boards_repertoire_color.sql",
  ),
  "utf8",
);

describe("SIG-1092 repertoire_color migration contract", () => {
  it("adds a nullable repertoire_color column with a white/black check", () => {
    assert.ok(migration.includes("add column if not exists repertoire_color"), "missing column");
    assert.ok(
      migration.includes("check (repertoire_color in ('white', 'black'))"),
      "missing color check",
    );
  });

  it("enforces one board per color per user with a partial unique index", () => {
    assert.ok(migration.includes("boards_user_repertoire_color_uq"), "missing unique index");
    assert.ok(migration.includes("on public.boards (user_id, repertoire_color)"), "wrong index scope");
    assert.ok(migration.includes("where repertoire_color is not null"), "index must be partial on non-null marks");
  });

  it("hydration and persistence map the mark in both directions", () => {
    const shell = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../studio/StudioShell.tsx"),
      "utf8",
    );
    const persistence = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../studio-persistence.ts"),
      "utf8",
    );
    assert.ok(shell.includes("repertoireColor"), "StudioShell must hydrate repertoireColor");
    assert.ok(shell.includes("row.repertoire_color"), "StudioShell must read the repertoire_color column");
    assert.ok(
      persistence.includes("repertoire_color: board.repertoireColor"),
      "persistBoardRecord must write repertoire_color in both branches",
    );
    assert.equal(
      persistence.match(/repertoire_color: board\.repertoireColor/g)?.length,
      2,
      "update and insert branches must both write repertoire_color",
    );
  });
});
