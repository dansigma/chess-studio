// Unit tests for `src/lib/admin/coach-invites.ts` (SIG-1062):
// hash-only invite tokens, admin enforcement, and fail-closed RPC mapping.
// The service client is faked per test through a holder, following the
// `mock.module` + dynamic-import pattern in `access.test.ts`.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

type Row = Record<string, string | null>;

interface FakeQuery {
  calls: { insert: unknown[]; update: unknown[]; select: string[]; rpc: unknown[] };
  tables: Record<string, Row[]>;
  rpcResult: { data: unknown; error: unknown };
  insertError: unknown;
  selectError: unknown;
}

function createFakeQuery(state: { tables?: Record<string, Row[]>; rpc?: { ok: boolean; code: string } }): FakeQuery {
  const calls = { insert: [] as unknown[], update: [] as unknown[], select: [] as string[], rpc: [] as unknown[] };
  return {
    calls,
    tables: state.tables ?? {},
    rpcResult: { data: state.rpc ?? { ok: true, code: "accepted" }, error: null },
    insertError: null,
    selectError: null,
  };
}

function makeServiceClient(fake: FakeQuery) {
  const builder = (table: string) => {
    const eqFilters: Array<{ col: string; val: unknown }> = [];
    let updatedRow: unknown = null;
    const chain = {
      select(...args: unknown[]) {
        fake.calls.select.push(`${table}:${String(args[0])}`);
        return chain;
      },
      order() {
        return Promise.resolve({ data: fake.tables[table] ?? [], error: fake.selectError });
      },
      eq(col: unknown, val: unknown) {
        eqFilters.push({ col: String(col), val });
        return chain;
      },
      is() {
        return chain;
      },
      async maybeSingle() {
        if (updatedRow !== null) {
          const rows = fake.tables[table] ?? [];
          const idFilter = eqFilters.find((f) => f.col === "id");
          const pending = rows.filter(
            (r) =>
              r.revoked_at == null &&
              r.accepted_at == null &&
              (!idFilter || r.id === String(idFilter.val)),
          );
          return { data: pending[0] ?? null, error: null };
        }
        const idFilter = eqFilters.find((f) => f.col === "id");
        const rows = fake.tables[table] ?? [];
        if (idFilter) {
          return { data: rows.find((r) => r.id === String(idFilter.val)) ?? null, error: fake.selectError };
        }
        return { data: rows[0] ?? null, error: fake.selectError };
      },
      async single() {
        if (fake.insertError) {
          return { data: null, error: fake.insertError };
        }
        const rows = fake.tables[table] ?? [];
        return { data: rows[0] ?? { id: "invite-1" }, error: null };
      },
      insert(row: unknown) {
        fake.calls.insert.push({ table, row });
        return chain;
      },
      update(row: unknown) {
        fake.calls.update.push({ table, row });
        updatedRow = row;
        return chain;
      },
    };
    return chain;
  };
  return {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: unknown) => {
      fake.calls.rpc.push({ name, args });
      return fake.rpcResult;
    },
  };
}

mock.module("@/src/lib/supabase/admin.ts", {
  namedExports: {
    createServiceSupabase: () => (globalThis as { __inviteService?: unknown }).__inviteService ?? null,
  },
});

const { sha256Hex, randomInviteToken, createInvite, revokeInvite, resendInvite, listInvites, acceptInvite, CoachInviteError } = await import(
  "@/src/lib/admin/coach-invites.ts"
);

function install(fake: FakeQuery | null) {
  (globalThis as { __inviteService?: unknown }).__inviteService = fake ? makeServiceClient(fake) : null;
}

test("sha256Hex matches the known SHA-256 vector", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("randomInviteToken is 43-char base64url", () => {
  for (let i = 0; i < 5; i += 1) {
    const token = randomInviteToken();
    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  }
  assert.notEqual(randomInviteToken(), randomInviteToken());
});

test("createInvite stores the hash and returns the raw token once", async () => {
  const fake = createFakeQuery({
    tables: { coach_invites: [{ id: "invite-9", email: "coach@example.com" }] },
  });
  install(fake);
  const before = Date.now();
  const result = await createInvite({ callerRole: "admin", email: "  Coach@Example.com ", invitedBy: "admin-1" });
  assert.equal(result.id, "invite-9");
  assert.equal(result.token.length, 43);
  const inserted = fake.calls.insert[0] as { table: string; row: Record<string, unknown> };
  assert.equal(inserted.table, "coach_invites");
  assert.equal(inserted.row.email, "coach@example.com");
  assert.equal(inserted.row.invited_by, "admin-1");
  assert.equal(await sha256Hex(result.token), inserted.row.token_hash);
  const expiresAt = Date.parse(String(inserted.row.expires_at));
  assert.ok(expiresAt - before > 6.5 * 24 * 60 * 60 * 1000, "expires ~7 days out");
  assert.ok(expiresAt - before <= 7.5 * 24 * 60 * 60 * 1000, "expires ~7 days out");
});

test("mutating and listing functions reject non-admin callers without touching the service", async () => {
  const fake = createFakeQuery({});
  install(fake);
  for (const role of ["student", "coach", null] as const) {
    await assert.rejects(createInvite({ callerRole: role, email: "a@b.c", invitedBy: "x" }), (error: unknown) => {
      assert.ok(error instanceof CoachInviteError);
      assert.equal((error as InstanceType<typeof CoachInviteError>).code, "forbidden");
      return true;
    });
    await assert.rejects(revokeInvite({ callerRole: role, inviteId: "i" }), { message: "coach invite failed: forbidden" });
    await assert.rejects(resendInvite({ callerRole: role, inviteId: "i", invitedBy: "x" }), {
      message: "coach invite failed: forbidden",
    });
    await assert.rejects(listInvites({ callerRole: role }), { message: "coach invite failed: forbidden" });
  }
  assert.deepEqual(fake.calls.insert, []);
  assert.deepEqual(fake.calls.update, []);
  assert.deepEqual(fake.calls.select, []);
});

test("service-unavailable fails closed with unavailable", async () => {
  install(null);
  await assert.rejects(createInvite({ callerRole: "admin", email: "a@b.c", invitedBy: "x" }), {
    message: "coach invite failed: unavailable",
  });
  await assert.rejects(revokeInvite({ callerRole: "admin", inviteId: "i" }), {
    message: "coach invite failed: unavailable",
  });
  await assert.rejects(listInvites({ callerRole: "admin" }), {
    message: "coach invite failed: unavailable",
  });
  await assert.rejects(
    acceptInvite({ token: "t", userId: "u", email: "a@b.c", emailConfirmedAt: "2026-01-01T00:00:00Z" }),
    { message: "coach invite failed: unavailable" },
  );
});

test("createInvite rejects blank email before any DB call", async () => {
  const fake = createFakeQuery({});
  install(fake);
  await assert.rejects(createInvite({ callerRole: "admin", email: "   ", invitedBy: "x" }), {
    message: "coach invite failed: invalid_email",
  });
  assert.deepEqual(fake.calls.insert, []);
});

test("revokeInvite revokes pending, not_found otherwise", async () => {
  const pending = createFakeQuery({
    tables: { coach_invites: [{ id: "i1", revoked_at: null, accepted_at: null }] },
  });
  install(pending);
  await revokeInvite({ callerRole: "admin", inviteId: "i1" });
  assert.equal(pending.calls.update.length, 1);

  const consumed = createFakeQuery({
    tables: { coach_invites: [{ id: "i2", revoked_at: null, accepted_at: "2026-01-01T00:00:00Z" }] },
  });
  install(consumed);
  await assert.rejects(revokeInvite({ callerRole: "admin", inviteId: "i2" }), {
    message: "coach invite failed: not_found",
  });

  const missing = createFakeQuery({ tables: { coach_invites: [] } });
  install(missing);
  await assert.rejects(revokeInvite({ callerRole: "admin", inviteId: "nope" }), {
    message: "coach invite failed: not_found",
  });
});

test("resendInvite revokes the pending row and returns a fresh token", async () => {
  const fake = createFakeQuery({
    tables: {
      coach_invites: [{ id: "old", email: "coach@example.com", revoked_at: null, accepted_at: null }],
    },
  });
  install(fake);
  const result = await resendInvite({ callerRole: "admin", inviteId: "old", invitedBy: "admin-1" });
  assert.equal(result.token.length, 43);
  assert.equal(fake.calls.update.length, 1);
  assert.equal(fake.calls.insert.length, 1);
  const inserted = fake.calls.insert[0] as { row: Record<string, unknown> };
  assert.equal(inserted.row.email, "coach@example.com");
  assert.equal(await sha256Hex(result.token), inserted.row.token_hash);
});

test("resendInvite rejects accepted, revoked, or missing invites", async () => {
  for (const row of [
    { id: "a", email: "e@x.co", revoked_at: null, accepted_at: "2026-01-01T00:00:00Z" },
    { id: "r", email: "e@x.co", revoked_at: "2026-01-01T00:00:00Z", accepted_at: null },
  ]) {
    const fake = createFakeQuery({ tables: { coach_invites: [row] } });
    install(fake);
    await assert.rejects(resendInvite({ callerRole: "admin", inviteId: row.id, invitedBy: "x" }), {
      message: "coach invite failed: not_found",
    });
    assert.deepEqual(fake.calls.insert, [], "no new invite on rejection");
  }
  const missing = createFakeQuery({ tables: { coach_invites: [] } });
  install(missing);
  await assert.rejects(resendInvite({ callerRole: "admin", inviteId: "nope", invitedBy: "x" }), {
    message: "coach invite failed: not_found",
  });
});

test("listInvites maps rows newest-first", async () => {
  const rows = [
    {
      id: "n",
      email: "new@example.com",
      expires_at: "2026-11-01T00:00:00Z",
      accepted_at: null,
      revoked_at: null,
      created_at: "2026-10-20T00:00:00Z",
    },
    {
      id: "o",
      email: "old@example.com",
      expires_at: "2026-10-01T00:00:00Z",
      accepted_at: "2026-09-01T00:00:00Z",
      revoked_at: null,
      created_at: "2026-09-01T00:00:00Z",
    },
  ];
  const fake = createFakeQuery({ tables: { coach_invites: rows } });
  install(fake);
  const result = await listInvites({ callerRole: "admin" });
  assert.deepEqual(result, [
    {
      id: "n",
      email: "new@example.com",
      expiresAt: "2026-11-01T00:00:00Z",
      acceptedAt: null,
      revokedAt: null,
      createdAt: "2026-10-20T00:00:00Z",
    },
    {
      id: "o",
      email: "old@example.com",
      expiresAt: "2026-10-01T00:00:00Z",
      acceptedAt: "2026-09-01T00:00:00Z",
      revokedAt: null,
      createdAt: "2026-09-01T00:00:00Z",
    },
  ]);
});

test("acceptInvite maps every RPC code through and lowercases the email", async () => {
  const codes = ["accepted", "invalid", "not_found", "expired", "revoked", "consumed", "email_mismatch", "role_unchanged"] as const;
  for (const code of codes) {
    const fake = createFakeQuery({ rpc: { ok: code === "accepted", code } });
    install(fake);
    const result = await acceptInvite({
      token: "raw-token",
      userId: "user-1",
      email: "Player@Example.com",
      emailConfirmedAt: "2026-01-01T00:00:00Z",
    });
    assert.deepEqual(result, { ok: code === "accepted", code });
    const rpcCall = fake.calls.rpc[0] as { name: string; args: Record<string, string> };
    assert.equal(rpcCall.name, "accept_coach_invite");
    assert.equal(rpcCall.args.p_email, "player@example.com");
    assert.equal(rpcCall.args.p_user_id, "user-1");
    assert.equal(rpcCall.args.p_token_hash, await sha256Hex("raw-token"));
  }
});

test("acceptInvite fails closed for unconfirmed email without RPC", async () => {
  const fake = createFakeQuery({ rpc: { ok: true, code: "accepted" } });
  install(fake);
  for (const emailConfirmedAt of [null, undefined]) {
    const result = await acceptInvite({ token: "t", userId: "u", email: "a@b.c", emailConfirmedAt });
    assert.deepEqual(result, { ok: false, code: "email_mismatch" });
  }
  assert.deepEqual(fake.calls.rpc, []);
});

test("acceptInvite throws unavailable on RPC failure", async () => {
  const failing = createFakeQuery({});
  failing.rpcResult = { data: null, error: new Error("boom") };
  install(failing);
  await assert.rejects(
    acceptInvite({ token: "t", userId: "u", email: "a@b.c", emailConfirmedAt: "2026-01-01T00:00:00Z" }),
    { message: "coach invite failed: unavailable" },
  );
});
