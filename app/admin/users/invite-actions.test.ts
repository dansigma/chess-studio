// Tests for the coach invite server actions (SIG-1064): admin gating via the
// real getRole, validation before quota, invite-link shape, hash-only storage,
// error-code passthrough, and the 10 req/10 min quota.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase, nextTestIp, setRequestHeaders } from "@/src/test-utils/route-test.ts";

const serverState: { server?: unknown } = {};
const serviceState: { service?: unknown } = {};
// NOTE: same pattern as actions.test.ts — both boundaries are mocked once,
// manually, with per-test holders (node:test forbids double-mocking).
mock.module("@/src/lib/supabase/server.ts", {
  namedExports: {
    createServerSupabase: async () => serverState.server ?? null,
    createPublicServerSupabase: () => null,
  },
});
mock.module("@/src/lib/supabase/admin.ts", {
  namedExports: {
    createServiceSupabase: () => serviceState.service ?? null,
  },
});

const { createInviteAction, listInvitesAction, revokeInviteAction, resendInviteAction } = await import(
  "./invite-actions.ts"
);
const { sha256Hex } = await import("@/src/lib/admin/coach-invites.ts");

function withRequest({ ip = nextTestIp(), origin = "https://studio.example" }: { ip?: string; origin?: string } = {}) {
  setRequestHeaders(new Headers({ "x-forwarded-for": ip, origin }));
}

function server(
  user: { id: string; email?: string; email_confirmed_at?: string | null } | null,
  profileRole: unknown,
) {
  const fake = createFakeSupabase({
    tables: { profiles: { maybeSingle: profileRole === null ? null : { role: profileRole } } },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  });
  serverState.server = fake;
  return fake;
}

interface ServiceLog {
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  selects: string[];
  rpc: Array<{ name: string; args: Record<string, unknown> }>;
}

function service(state: {
  insert?: (row: Record<string, unknown>) => { data: unknown; error: unknown };
  selectAll?: () => { data: unknown; error: unknown };
  maybeSingleRow?: Record<string, unknown> | null;
  revokeError?: unknown;
}): { log: ServiceLog } {
  const log: ServiceLog = { inserts: [], selects: [], rpc: [] };
  let revoked = false;
  serviceState.service = {
    from: (table: string) => {
      const eqFilters: Array<{ col: string; val: unknown }> = [];
      const chain = {
        select(...args: unknown[]) {
          log.selects.push(`${table}:${String(args[0])}`);
          return chain;
        },
        order() {
          return Promise.resolve(state.selectAll ? state.selectAll() : { data: [], error: null });
        },
        eq(col: unknown, val: unknown) {
          eqFilters.push({ col: String(col), val });
          return chain;
        },
        is() {
          return chain;
        },
        async maybeSingle() {
          if (revoked) {
            const idFilter = eqFilters.find((f) => f.col === "id");
            if (!idFilter) return { data: null, error: null };
            // Post-revoke lookup for the update path: only pending rows match.
            const row = state.maybeSingleRow;
            if (row && String(row.id) === String(idFilter.val) && row.revoked_at == null && row.accepted_at == null) {
              return { data: row, error: null };
            }
            return { data: null, error: null };
          }
          const idFilter = eqFilters.find((f) => f.col === "id");
          if (!idFilter) return { data: state.maybeSingleRow ?? null, error: null };
          const row = state.maybeSingleRow;
          if (row && String(row.id) === String(idFilter.val)) return { data: row, error: null };
          return { data: null, error: null };
        },
        async single() {
          const inserted = state.insert
            ? state.insert({ table })
            : { data: { id: "invite-1" }, error: null };
          return inserted;
        },
        insert(row: unknown) {
          log.inserts.push({ table, row: row as Record<string, unknown> });
          return chain;
        },
        update(row: unknown) {
          if (state.revokeError) {
            return {
              eq: () => ({ is: () => ({ is: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: state.revokeError }) }) }) }) }),
            };
          }
          revoked = true;
          void row;
          const idFilter = eqFilters.find((f) => f.col === "id");
          const pendingRow = state.maybeSingleRow;
          const matches =
            pendingRow &&
            (!idFilter || String(pendingRow.id) === String(idFilter.val)) &&
            pendingRow.revoked_at == null &&
            pendingRow.accepted_at == null;
          return {
            eq: () => ({ is: () => ({ is: () => ({ select: () => ({ maybeSingle: async () => ({ data: matches ? pendingRow : null, error: null }) }) }) }) }),
          };
        },
      };
      return chain;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      log.rpc.push({ name, args });
      return { data: null, error: null };
    },
  };
  return { log };
}

const ADMIN = { id: "admin-1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const STUDENT = { id: "student-1", email: "kid@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const COACH = { id: "coach-1", email: "coach@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

test("signed-out, student, and coach callers get forbidden without touching the service", async () => {
  const cases: Array<{ user: typeof ADMIN | null; role: unknown }> = [
    { user: null, role: null },
    { user: STUDENT, role: "student" },
    { user: COACH, role: "coach" },
  ];
  for (const { user, role } of cases) {
    server(user, role);
    const { log } = service({});
    withRequest();
    assert.deepEqual(await createInviteAction({ email: "new@example.com" }), { ok: false, code: "forbidden" });
    withRequest();
    assert.deepEqual(await listInvitesAction(), { ok: false, code: "forbidden" });
    withRequest();
    assert.deepEqual(await revokeInviteAction({ id: "i1" }), { ok: false, code: "forbidden" });
    withRequest();
    assert.deepEqual(await resendInviteAction({ id: "i1" }), { ok: false, code: "forbidden" });
    assert.equal(log.inserts.length, 0);
    assert.equal(log.selects.length, 0);
  }
});

test("blank email and blank id are rejected before any DB call", async () => {
  server(ADMIN, "admin");
  const { log } = service({});
  withRequest();
  assert.deepEqual(await createInviteAction({ email: "   " }), { ok: false, code: "invalid_email" });
  withRequest();
  assert.deepEqual(await revokeInviteAction({ id: "" }), { ok: false, code: "not_found" });
  withRequest();
  assert.deepEqual(await resendInviteAction({ id: "" }), { ok: false, code: "not_found" });
  assert.equal(log.inserts.length, 0);
  assert.equal(log.selects.length, 0);
});

test("create returns a one-time link and stores only the hash", async () => {
  server(ADMIN, "admin");
  let captured: Record<string, unknown> = {};
  const { log } = service({
    insert: () => ({ data: { id: "invite-9" }, error: null }),
  });
  // Capture the insert row via the log wrapper.
  withRequest({ origin: "https://studio.example" });
  const result = await createInviteAction({ email: "  Coach@Example.com " });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.id, "invite-9");
  assert.ok(result.data.link.startsWith("https://studio.example/coach-invite/"), `link shape: ${result.data.link}`);
  const token = result.data.link.split("/coach-invite/")[1];
  assert.equal(token.length, 43);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(Date.parse(result.data.expiresAt) > Date.now());
  assert.equal(log.inserts.length, 1);
  captured = log.inserts[0].row;
  assert.equal(captured.email, "coach@example.com");
  assert.equal(captured.invited_by, "admin-1");
  assert.ok(typeof captured.token_hash === "string" && (captured.token_hash as string).length === 64);
  assert.equal(await sha256Hex(token), captured.token_hash);
  assert.ok(!("token" in captured), "plaintext token must never be stored");
});

test("list returns rows with no token or hash", async () => {
  server(ADMIN, "admin");
  const rows = [
    { id: "n", email: "new@example.com", expires_at: "2026-11-01T00:00:00Z", accepted_at: null, revoked_at: null, created_at: "2026-10-20T00:00:00Z" },
  ];
  service({ selectAll: () => ({ data: rows, error: null }) });
  withRequest();
  const result = await listInvitesAction();
  assert.deepEqual(result, {
    ok: true,
    data: {
      invites: [
        { id: "n", email: "new@example.com", expiresAt: "2026-11-01T00:00:00Z", acceptedAt: null, revokedAt: null, createdAt: "2026-10-20T00:00:00Z" },
      ],
    },
  });
  if (result.ok) {
    for (const row of result.data.invites) {
      assert.ok(!("token" in row) && !("token_hash" in row), "list must never return a token or hash");
    }
  }
});

test("revoke maps lib not_found through", async () => {
  server(ADMIN, "admin");
  service({ maybeSingleRow: null });
  withRequest();
  assert.deepEqual(await revokeInviteAction({ id: "missing" }), { ok: false, code: "not_found" });
});

test("resend returns a fresh one-time link", async () => {
  server(ADMIN, "admin");
  service({
    maybeSingleRow: { id: "old", email: "coach@example.com", accepted_at: null, revoked_at: null },
    insert: () => ({ data: { id: "invite-10" }, error: null }),
  });
  withRequest({ origin: "https://studio.example" });
  const result = await resendInviteAction({ id: "old" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.id, "invite-10");
  assert.ok(result.data.link.startsWith("https://studio.example/coach-invite/"));
  const token = result.data.link.split("/coach-invite/")[1];
  assert.equal(token.length, 43);
});

test("create is rate-limited after 10 requests", async () => {
  // Dedicated admin id + IP: the module limiter is shared across tests and the
  // earlier create test already spent one user-quota slot for admin-1.
  const rateAdmin = { id: "admin-ratelimit", email: "rl@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
  server(rateAdmin, "admin");
  service({ insert: () => ({ data: { id: "invite-x" }, error: null }) });
  const ip = nextTestIp();
  // The module limiter is shared: burn this test's own IP bucket only.
  for (let i = 0; i < 10; i += 1) {
    withRequest({ ip });
    const result = await createInviteAction({ email: `user${i}@example.com` });
    assert.equal(result.ok, true, `request ${i + 1} should pass`);
  }
  withRequest({ ip });
  assert.deepEqual(await createInviteAction({ email: "extra@example.com" }), { ok: false, code: "rate_limited" });
});
