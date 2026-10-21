import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261007120000_sig861_rls_indexes_drafts.sql"),
  "utf8",
);

describe("sig-861 rls contract", () => {
  it("wraps every auth check as a select subquery", () => {
    const bare = migration.match(/(?<![\w(])auth\.uid\(\)(?!\))/g) ?? [];
    assert.equal(bare.length, 0, `found ${bare.length} unwrapped auth checks`);
    assert.ok(migration.includes("(select auth.uid())"), "expected at least one wrapped auth check");
  });

  it("adds the two missing own-row deletes and the game_positions update", () => {
    for (const name of ["settings_delete_own", "course_progress_delete_own", "game_positions_update_own"]) {
      assert.ok(migration.includes(`"${name}"`), `missing policy ${name}`);
    }
  });

  it("keeps client writes closed on courses, profiles, and course_admins", () => {
    const lines = migration.split("\n");
    const writeOn = (table: string) =>
      lines.filter((line) => new RegExp(`on public\\.${table}$`).test(line.trim()) && /for (insert|update|delete)/.test(line));
    for (const table of ["courses", "profiles", "course_admins"]) {
      assert.deepEqual(writeOn(table), [], `client write policy on ${table}`);
    }
  });

  it("creates the four planned indexes", () => {
    for (const name of ["courses_created_by_idx", "courses_published_updated_idx", "games_white_trgm_idx", "games_black_trgm_idx"]) {
      assert.ok(migration.includes(`create index if not exists ${name}`), `missing index ${name}`);
    }
  });

  it("creates published_at before the index and policy that reference it", () => {
    const col = migration.indexOf("add column if not exists published_at");
    const index = migration.indexOf("courses_published_updated_idx");
    const policy = migration.indexOf("courses_select_published");
    assert.ok(col !== -1 && index !== -1 && policy !== -1, "missing column, index, or policy");
    assert.ok(col < index, "published_at must be created before courses_published_updated_idx (fresh apply)");
    assert.ok(col < policy, "published_at must be created before the courses_select_published policy");
  });
});

describe("sig-1030 admin role lifecycle migration", () => {
  const sig1030 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261020120000_sig1030_admin_role_lifecycle.sql"),
    "utf8",
  );

  it("redefines handle_new_user as security definer with empty search_path", () => {
    assert.ok(sig1030.includes("create or replace function private.handle_new_user()"));
    assert.ok(/security definer/.test(sig1030));
    assert.ok(/set search_path = ''/.test(sig1030));
  });

  it("assigns admin only for confirmed emails", () => {
    const confirmed = sig1030.indexOf("new.email_confirmed_at is not null");
    const listed = sig1030.indexOf("public.course_admins");
    const grant = sig1030.indexOf("assigned := 'admin'");
    assert.ok(confirmed !== -1 && listed !== -1 && grant !== -1, "trigger must check email_confirmed_at");
    assert.ok(confirmed < grant && listed < grant, "checks must precede the admin assignment");
  });
});

describe("sig-1049 marketplace roles migration", () => {
  const sig1049 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021120000_marketplace_roles.sql"),
    "utf8",
  );
  const lines = sig1049.split("\n").map((line) => line.trim());

  it("lets profiles.role be student, coach or admin and nothing else", () => {
    assert.ok(sig1049.includes("drop constraint if exists profiles_role_check"));
    assert.ok(sig1049.includes("check (role in ('student', 'coach', 'admin'))"));
  });

  it("adds role_source limited to system or manual", () => {
    assert.ok(sig1049.includes("add column if not exists role_source text not null default 'system'"));
    assert.ok(sig1049.includes("check (role_source in ('system', 'manual'))"));
  });

  for (const table of ["role_changes", "coach_invites"]) {
    it(`keeps ${table} closed to clients (RLS on, no grants, no write policies)`, () => {
      assert.ok(sig1049.includes(`alter table public.${table} enable row level security`));
      assert.ok(sig1049.includes(`revoke all on table public.${table} from anon, authenticated`));
      const writes = lines.filter(
        (line) => new RegExp(`on public\\.${table}$`).test(line) && /for (insert|update|delete|all)/.test(line),
      );
      assert.deepEqual(writes, []);
      assert.ok(sig1049.includes(`on public.${table}\n  for select to authenticated\n  using (false)`));
    });
  }

  it("stores only a hash for invite tokens and a bounded reason for role changes", () => {
    assert.ok(sig1049.includes("token_hash text not null unique"));
    assert.ok(!/\btoken text\b/.test(sig1049));
    assert.ok(sig1049.includes("check (email = lower(email))"));
    assert.ok(sig1049.includes("char_length(btrim(reason)) between 3 and 500"));
  });

  it("does not add client write policies to profiles", () => {
    const writes = lines.filter((line) => /on public\.profiles$/.test(line) && /for (insert|update|delete)/.test(line));
    assert.deepEqual(writes, []);
  });
});
