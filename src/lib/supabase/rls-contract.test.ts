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

describe("sig-1037 games pending swap migration", () => {
  const sig1037 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261023200000_games_pending_swap.sql"),
    "utf8",
  );

  it("adds a pending flag defaulting to false with a partial index", () => {
    assert.ok(sig1037.includes("add column if not exists pending boolean not null default false"), "missing pending column");
    assert.ok(sig1037.includes("where pending"), "partial index must filter on pending");
    assert.ok(sig1037.includes("games_database_pending_idx"), "missing partial index");
  });

  it("defines swap_database_games as security invoker with an empty search_path", () => {
    assert.ok(sig1037.includes("create or replace function public.swap_database_games(p_database_id uuid)"));
    assert.ok(/security invoker/.test(sig1037));
    assert.ok(/set search_path = ''/.test(sig1037));
  });

  it("swaps in one transaction, returns the promoted count, and grants only to authenticated", () => {
    assert.ok(sig1037.includes("delete from public.games where database_id = p_database_id and pending = false"));
    assert.ok(sig1037.includes("update public.games set pending = false"));
    assert.ok(sig1037.includes("get diagnostics promoted = row_count"));
    assert.ok(
      sig1037.includes("grant execute on function public.swap_database_games(uuid) to authenticated"),
      "grant must be scoped to authenticated",
    );
    assert.ok(!/to (anon|public|service_role)/.test(sig1037), "no grants beyond authenticated");
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

describe("sig-1039 linked_accounts migration", () => {
  const sig1039 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021190000_linked_accounts.sql"),
    "utf8",
  );

  it("enables RLS with own-row select, insert, update and delete policies", () => {
    assert.ok(sig1039.includes("alter table public.linked_accounts enable row level security"));
    for (const name of [
      "linked_accounts_select_own",
      "linked_accounts_insert_own",
      "linked_accounts_update_own",
      "linked_accounts_delete_own",
    ]) {
      assert.ok(sig1039.includes(`"${name}"`), `missing policy ${name}`);
    }
  });

  it("wraps every auth check as a select subquery and grants only to authenticated", () => {
    const bare = sig1039.match(/(?<![\w(])auth\.uid\(\)(?!\))/g) ?? [];
    assert.equal(bare.length, 0, `found ${bare.length} unwrapped auth checks`);
    assert.ok(sig1039.includes("(select auth.uid())"), "expected at least one wrapped auth check");
    assert.ok(
      sig1039.includes("grant select, insert, update, delete on public.linked_accounts to authenticated"),
      "grants must be scoped to authenticated",
    );
    assert.ok(!/to (anon|public|service_role)/.test(sig1039), "no grants beyond authenticated");
  });

  it("constrains source to lichess/chesscom and usernames to 2-30 handle chars", () => {
    assert.ok(sig1039.includes("primary key (user_id, source)"), "one account per site");
    assert.ok(sig1039.includes("check (source in ('lichess', 'chesscom'))"));
    assert.ok(sig1039.includes("username ~ '^[A-Za-z0-9_-]{2,30}$'"));
  });
});

describe("sig-1088 my_games migration", () => {
  const sig1088 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021200000_my_games.sql"),
    "utf8",
  );

  it("enables RLS with own-row select, insert and delete policies (no full-table update)", () => {
    assert.ok(sig1088.includes("alter table public.my_games enable row level security"));
    for (const name of ["my_games_select_own", "my_games_insert_own", "my_games_delete_own"]) {
      assert.ok(sig1088.includes(`"${name}"`), `missing policy ${name}`);
    }
    // SIG-1090 adds the narrow my_games_update_review_own policy in its own
    // migration; the base migration must not open a full-table update.
    assert.ok(!sig1088.includes("my_games_update_own"), "no full-table client update on my_games");
  });

  it("wraps every auth check as a select subquery and grants only to authenticated", () => {
    const bare = sig1088.match(/(?<![\w(])auth\.uid\(\)(?!\))/g) ?? [];
    assert.equal(bare.length, 0, `found ${bare.length} unwrapped auth checks`);
    assert.ok(sig1088.includes("(select auth.uid())"), "expected at least one wrapped auth check");
    assert.ok(
      sig1088.includes("grant select, insert, delete on public.my_games to authenticated"),
      "grants must be scoped to authenticated",
    );
    assert.ok(!/to (anon|public|service_role)/.test(sig1088), "no grants beyond authenticated");
  });

  it("dedupes on (user_id, source, external_id) and indexes recent games", () => {
    assert.ok(sig1088.includes("unique (user_id, source, external_id)"), "dedupe scope");
    assert.ok(sig1088.includes("my_games_user_played_idx"), "recent-games index");
    assert.ok(sig1088.includes("(user_id, played_at desc)"), "index order");
  });

  it("constrains source/color/result and caps pgn at 1 MB", () => {
    assert.ok(sig1088.includes("check (source in ('lichess', 'chesscom'))"));
    assert.ok(sig1088.includes("check (color in ('white', 'black'))"));
    assert.ok(sig1088.includes("check (result in ('win', 'loss', 'draw'))"));
    assert.ok(sig1088.includes("octet_length(pgn) <= 1000000"), "1 MB pgn cap");
  });
});

describe("sig-1090 my_games review summary migration", () => {
  const sig1090 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021210000_my_games_review_summary.sql"),
    "utf8",
  );

  it("adds the four review-summary columns with a 2 KB mistake_counts cap", () => {
    for (const column of ["user_accuracy real", "opponent_accuracy real", "reviewed_at timestamptz", "mistake_counts jsonb"]) {
      assert.ok(sig1090.includes(`add column if not exists ${column}`), `missing column ${column}`);
    }
    assert.ok(sig1090.includes("my_games_mistake_counts_size"), "missing size constraint");
    assert.ok(sig1090.includes("pg_column_size(mistake_counts) < 2048"), "2 KB mistake_counts cap");
  });

  it("adds a narrow own-row update policy and a column-scoped grant", () => {
    assert.ok(sig1090.includes('"my_games_update_review_own"'), "missing review update policy");
    assert.ok(sig1090.includes("for update"), "policy must be update-only");
    assert.ok(sig1090.includes("using ((select auth.uid()) = user_id)"), "missing using clause");
    assert.ok(sig1090.includes("with check ((select auth.uid()) = user_id)"), "missing with-check clause");
    assert.ok(
      sig1090.includes("grant update (user_accuracy, opponent_accuracy, reviewed_at, mistake_counts)"),
      "grant must be limited to the four review columns",
    );
    const bare = sig1090.match(/(?<![\w(])auth\.uid\(\)(?!\))/g) ?? [];
    assert.equal(bare.length, 0, `found ${bare.length} unwrapped auth checks`);
    assert.ok(!/to (anon|public|service_role)/.test(sig1090), "no grants beyond authenticated");
  });
});

describe("sig-1042 puzzles migration", () => {
  const sig1042 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021250000_puzzles.sql"),
    "utf8",
  );

  it("creates a read-only public puzzles table with odd-length lines and rating/theme indexes", () => {
    assert.ok(sig1042.includes("create table if not exists public.puzzles"));
    assert.ok(sig1042.includes("check (cardinality(moves) % 2 = 1)"), "solver-to-move odd line");
    assert.ok(sig1042.includes("puzzles_rating_idx"), "missing rating index");
    assert.ok(sig1042.includes("puzzles_themes_idx"), "missing themes GIN index");
    assert.ok(sig1042.includes("using gin (themes)"), "themes index must be GIN");
  });

  it("enables RLS with a select-only policy and select-only grants", () => {
    assert.ok(sig1042.includes("alter table public.puzzles enable row level security"));
    assert.ok(sig1042.includes('"puzzles_select"'), "missing select policy");
    assert.ok(sig1042.includes("for select to anon, authenticated"), "select must cover anon + authenticated");
    const lines = sig1042.split("\n").map((line) => line.trim());
    const writes = lines.filter(
      (line) => /on public\.puzzles$/.test(line) && /for (insert|update|delete|all)/.test(line),
    );
    assert.deepEqual(writes, [], "no client write policy on puzzles");
    assert.ok(sig1042.includes("grant select on public.puzzles to anon, authenticated"), "select-only grant");
    assert.ok(!/grant\s+(?!select\b)\w+.*on public\.puzzles/.test(sig1042), "no non-select grant on puzzles");
  });
});

describe("sig-1102 puzzles_window migration", () => {
  const sig1102 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021260000_puzzles_sample.sql"),
    "utf8",
  );

  it("samples public.puzzles with rating/theme/exclude filters in seed-stable order", () => {
    assert.ok(sig1102.includes("create or replace function public.puzzles_window("), "missing function");
    assert.ok(sig1102.includes("returns setof public.puzzles"), "must return table rows");
    assert.ok(sig1102.includes("themes @> array[p_theme]"), "missing theme containment filter");
    assert.ok(sig1102.includes("not (id = any (p_exclude))"), "missing exclude filter");
    assert.ok(sig1102.includes("order by md5("), "must order seed-stably");
    assert.ok(sig1102.includes("least(greatest("), "p_limit must be clamped");
  });

  it("is security invoker with an empty search_path and execute-only grants", () => {
    assert.ok(sig1102.includes("security invoker"), "must run as the caller so table RLS applies");
    assert.ok(!/security definer/.test(sig1102), "must not be security definer");
    assert.ok(/set search_path = ''/.test(sig1102), "must pin an empty search_path");
    assert.ok(
      sig1102.includes("grant execute on function public.puzzles_window(int, int, text, int, bigint, text[])"),
      "missing execute grant with the full signature",
    );
    assert.ok(sig1102.includes("to anon, authenticated"), "execute must cover anon + authenticated");
  });
});

describe("sig-1096 mistake_exercises migration", () => {
  const sig1096 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021230000_mistake_exercises.sql"),
    "utf8",
  );

  it("creates a per-user mistake_exercises table with a 256 KB data cap", () => {
    assert.ok(sig1096.includes("create table if not exists public.mistake_exercises"));
    assert.ok(sig1096.includes("user_id uuid primary key references auth.users (id) on delete cascade"));
    assert.ok(sig1096.includes("data jsonb not null default '{}'::jsonb"));
    assert.ok(sig1096.includes("mistake_exercises_data_size"), "missing size constraint");
    assert.ok(sig1096.includes("pg_column_size(data) < 262144"), "256 KB data cap");
  });

  it("enables RLS with own-row select, insert and update policies", () => {
    assert.ok(sig1096.includes("alter table public.mistake_exercises enable row level security"));
    for (const name of [
      "mistake_exercises_select_own",
      "mistake_exercises_insert_own",
      "mistake_exercises_update_own",
    ]) {
      assert.ok(sig1096.includes(`"${name}"`), `missing policy ${name}`);
    }
  });

  it("wraps every auth check as a select subquery and grants only to authenticated", () => {
    const bare = sig1096.match(/(?<![\w(])auth\.uid\(\)(?!\))/g) ?? [];
    assert.equal(bare.length, 0, `found ${bare.length} unwrapped auth checks`);
    assert.ok(sig1096.includes("(select auth.uid())"), "expected at least one wrapped auth check");
    assert.ok(
      sig1096.includes("grant select, insert, update on public.mistake_exercises to authenticated"),
      "grants must be scoped to authenticated",
    );
    assert.ok(!/to (anon|public|service_role)/.test(sig1096), "no grants beyond authenticated");
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

describe("sig-1050 course status and tier migration", () => {
  const sig1050 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021270000_course_status_and_tier.sql"),
    "utf8",
  );

  it("adds status with the five review states", () => {
    assert.ok(sig1050.includes("add column if not exists status text not null default 'draft'"));
    assert.ok(sig1050.includes("check (status in ('draft', 'in_review', 'published', 'rejected', 'archived'))"));
  });

  it("backfills published from published_at and drops the auto-publish default", () => {
    const backfill = sig1050.indexOf("set status = 'published' where published_at is not null");
    const dropDefault = sig1050.indexOf("alter column published_at drop default");
    assert.ok(backfill !== -1, "missing status backfill");
    assert.ok(dropDefault !== -1, "missing drop default");
    assert.ok(backfill < dropDefault, "backfill must precede dropping the published_at default");
  });

  it("adds the tier, price, currency, author, and review-note columns with checks", () => {
    assert.ok(sig1050.includes("add column if not exists access_tier text not null default 'free'"));
    assert.ok(sig1050.includes("check (access_tier in ('free', 'premium', 'paid'))"));
    assert.ok(sig1050.includes("add column if not exists price_cents integer"));
    assert.ok(sig1050.includes("check ((access_tier = 'paid') = (price_cents is not null))"));
    assert.ok(sig1050.includes("add column if not exists currency text not null default 'BRL'"));
    assert.ok(sig1050.includes("check (currency = 'BRL')"));
    assert.ok(sig1050.includes("add column if not exists author_display_name text"));
    assert.ok(sig1050.includes("review_note is null or char_length(review_note) <= 500"));
  });

  it("keeps the published policy on status and no client write policies", () => {
    assert.ok(sig1050.includes('"courses_select_published"'), "missing policy");
    assert.ok(sig1050.includes("for select to anon, authenticated"), "policy must cover anon + authenticated");
    assert.ok(sig1050.includes("using (status = 'published')"), "policy must use status");
    const lines1050 = sig1050.split("\n").map((line) => line.trim());
    const writes = lines1050.filter(
      (line) => /on public\.courses$/.test(line) && /for (insert|update|delete|all)/.test(line),
    );
    assert.deepEqual(writes, [], "no client write policy on courses");
  });

  it("replaces the published index with a status partial index", () => {
    assert.ok(sig1050.includes("courses_status_published_idx"), "missing status index");
    assert.ok(sig1050.includes("where status = 'published'"), "index must filter on status");
  });

  it("syncs published_at from status in a trigger", () => {
    assert.ok(sig1050.includes("courses_sync_published_at"), "missing trigger");
    assert.ok(sig1050.includes("set search_path = ''"), "function must pin the search path");
    assert.ok(sig1050.includes("new.status = 'published'"), "trigger must stamp on publish");
  });
});

describe("sig-1061 role management RPCs migration", () => {
  const sig1061 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021130000_role_management_rpcs.sql"),
    "utf8",
  );

  for (const [name, namedArgs, shortArgs] of [
    ["public.set_user_role", "(p_user_id uuid, p_new_role text, p_changed_by uuid, p_reason text)", "(uuid, text, uuid, text)"],
    ["public.admin_list_users", "(p_search text, p_role text, p_limit int, p_offset int)", "(text, text, int, int)"],
    ["public.admin_count_users", "(p_search text, p_role text)", "(text, text)"],
  ]) {
    const fn = `${name}${shortArgs}`;
    it(`defines ${fn} as security definer with an empty search_path`, () => {
      assert.ok(sig1061.includes(`create or replace function ${name}${namedArgs}`), `missing function ${fn}`);
      assert.ok(/security definer/.test(sig1061));
      assert.ok(/set search_path = ''/.test(sig1061));
    });

    it(`grants ${fn} to service_role only`, () => {
      assert.ok(
        sig1061.includes(`revoke execute on function ${fn} from public, anon, authenticated`),
        `missing revoke for ${fn}`,
      );
      assert.ok(
        sig1061.includes(`grant execute on function ${fn} to service_role`),
        `missing service_role grant for ${fn}`,
      );
    });
  }

  it("counts unpaged matches with the same filters via admin_count_users", () => {
    assert.ok(sig1061.includes("create or replace function public.admin_count_users(p_search text, p_role text)"));
    assert.ok(sig1061.includes("returns bigint"));
    assert.ok(sig1061.includes("revoke execute on function public.admin_count_users(text, text) from public, anon, authenticated"));
    assert.ok(sig1061.includes("grant execute on function public.admin_count_users(text, text) to service_role"));
  });

  it("guards set_user_role against bad input, self-demotion, no-ops and last-admin loss", () => {
    for (const code of ["invalid_role", "invalid_reason", "not_found", "own_role", "unchanged", "last_admin"]) {
      assert.ok(sig1061.includes(`raise exception '${code}'`), `missing ${code} guard`);
    }
  });

  it("serializes set_user_role with an advisory lock and a locked profile row", () => {
    assert.ok(sig1061.includes("pg_advisory_xact_lock(hashtext('set_user_role'))"), "missing advisory lock");
    assert.ok(sig1061.includes("for update"), "missing FOR UPDATE row lock");
  });

  it("writes role_source = 'manual' and the role_changes audit row on success", () => {
    assert.ok(sig1061.includes("role_source = 'manual'"), "must mark manual roles");
    assert.ok(sig1061.includes("insert into public.role_changes"), "must audit the change");
  });

  it("lists users from auth.users with a bounded page and a total count", () => {
    assert.ok(sig1061.includes("join public.profiles"), "must join profiles for roles");
    assert.ok(sig1061.includes("strpos(lower("), "search must be a case-insensitive substring without LIKE wildcards");
    assert.ok(sig1061.includes("select count(*) into v_total"), "must count the full filtered set, not the page window");
    assert.ok(sig1061.includes("least(greatest("), "p_limit must be clamped");
  });
});

describe("sig-1062 accept_coach_invite migration", () => {
  const sig1062 = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261021140000_accept_coach_invite.sql"),
    "utf8",
  );

  it("defines a locked, security-definer function with an empty search_path", () => {
    assert.ok(sig1062.includes("create or replace function public.accept_coach_invite(p_token_hash text, p_email text, p_user_id uuid)"));
    assert.ok(sig1062.includes("returns jsonb"));
    assert.ok(/security definer/.test(sig1062));
    assert.ok(/set search_path = ''/.test(sig1062));
    assert.ok(sig1062.includes("for update"), "invite row must be locked before guards");
  });

  it("enforces the guard chain in order", () => {
    for (const code of [
      "invalid",
      "not_found",
      "expired",
      "revoked",
      "consumed",
      "email_mismatch",
      "role_unchanged",
      "accepted",
    ]) {
      assert.ok(sig1062.includes(`'${code}'`), `missing guard code ${code}`);
    }
    const order = ["invalid", "not_found", "expired", "revoked", "consumed", "email_mismatch", "role_unchanged", "accepted"];
    const positions = order.map((code) => sig1062.indexOf(`'${code}'`));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, "guards out of order");
  });

  it("promotes student to coach with a manual stamp and an audit row", () => {
    assert.ok(sig1062.includes("set role = 'coach', role_source = 'manual'"));
    assert.ok(sig1062.includes("insert into public.role_changes"));
    assert.ok(sig1062.includes("'coach invite accepted'"));
    assert.ok(sig1062.includes("accepted_at = now()"), "invite must be marked consumed");
  });

  it("grants execute only to the service role", () => {
    assert.ok(
      sig1062.includes("grant execute on function public.accept_coach_invite(text, text, uuid) to service_role"),
      "missing service_role grant",
    );
    assert.ok(
      sig1062.includes("revoke all on function public.accept_coach_invite(text, text, uuid)"),
      "missing revoke-all",
    );
    assert.ok(
      !/grant execute on function public\.accept_coach_invite\([^)]*\) to (authenticated|anon|public)/.test(sig1062),
      "function must not be granted to clients",
    );
  });
});
