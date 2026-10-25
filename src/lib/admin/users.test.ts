// Unit tests for the admin users service lib (SIG-1061): typed RPC results,
// error-code mapping from the set_user_role / admin_list_users messages, and
// the unavailable fallback when the service client is missing.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

type RpcHandler = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

const serviceState: { service?: unknown } = {};
mock.module("@/src/lib/supabase/admin.ts", {
  namedExports: {
    createServiceSupabase: () => serviceState.service ?? null,
  },
});

const { ADMIN_USERS_PAGE_SIZE, changeUserRole, listUsers } = await import("./users.ts");

function installService(handler: RpcHandler, calls: Array<{ name: string; args: Record<string, unknown> }>) {
  serviceState.service = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return handler(name, args);
    },
  };
}

function rpcError(code: string) {
  return { data: null as unknown, error: new Error(`rpc failed: ${code}`) };
}

test("service client missing: both functions return unavailable", async () => {
  serviceState.service = null;
  assert.deepEqual(await listUsers({}), { ok: false, code: "unavailable" });
  assert.deepEqual(
    await changeUserRole({ userId: "u1", newRole: "coach", changedBy: "admin", reason: "good reason" }),
    { ok: false, code: "unavailable" },
  );
});

test("changeUserRole success returns the old role and passes exact args", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  installService(async () => ({ data: "student", error: null }), calls);
  const result = await changeUserRole({
    userId: "u1",
    newRole: "coach",
    changedBy: "admin-1",
    reason: "needs coaching access",
  });
  assert.deepEqual(result, { ok: true, oldRole: "student" });
  assert.deepEqual(calls, [
    {
      name: "set_user_role",
      args: { p_user_id: "u1", p_new_role: "coach", p_changed_by: "admin-1", p_reason: "needs coaching access" },
    },
  ]);
});

for (const code of ["invalid_role", "invalid_reason", "not_found", "own_role", "unchanged", "last_admin"]) {
  test(`changeUserRole maps '${code}' to its code`, async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    installService(async () => rpcError(code), calls);
    const result = await changeUserRole({ userId: "u1", newRole: "coach", changedBy: "admin-1", reason: "needs coaching access" });
    assert.deepEqual(result, { ok: false, code });
  });
}

test("changeUserRole maps unknown errors to unavailable", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  installService(async () => ({ data: null, error: new Error("connection reset") }), calls);
  const result = await changeUserRole({ userId: "u1", newRole: "coach", changedBy: "admin-1", reason: "needs coaching access" });
  assert.deepEqual(result, { ok: false, code: "unavailable" });
});

test("listUsers derives limit/offset from the page and returns rows plus total", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rows = [
    { id: "u1", email: "a@example.com", role: "coach", created_at: "2026-01-01", email_confirmed: true, total: 42 },
    { id: "u2", email: "b@example.com", role: "student", created_at: "2026-01-02", email_confirmed: false, total: 42 },
  ];
  installService(async () => ({ data: rows, error: null }), calls);
  const result = await listUsers({ search: "example", role: "coach", page: 3 });
  assert.deepEqual(result, { ok: true, data: { users: rows, total: 42 } });
  assert.deepEqual(calls, [
    {
      name: "admin_list_users",
      args: { p_search: "example", p_role: "coach", p_limit: ADMIN_USERS_PAGE_SIZE, p_offset: 2 * ADMIN_USERS_PAGE_SIZE },
    },
  ]);
});

test("listUsers clamps pages below 1 to the first page and blanks to null", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  installService(async () => ({ data: [], error: null }), calls);
  const result = await listUsers({ search: "   ", role: "", page: 0 });
  assert.deepEqual(result, { ok: true, data: { users: [], total: 0 } });
  assert.deepEqual(calls[0]?.args, {
    p_search: null,
    p_role: null,
    p_limit: ADMIN_USERS_PAGE_SIZE,
    p_offset: 0,
  });
});

test("listUsers keeps the total on an empty out-of-range page", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  // One matching user overall; page 2 returns no rows but the separate
  // count still reports the full filtered total.
  installService(async (name, args) => {
    if (name === "admin_list_users") {
      const offset = args.p_offset as number;
      return {
        data: offset === 0
          ? [{ id: "u1", email: "a@example.com", role: "coach", created_at: "2026-01-01", email_confirmed: true, total: 1 }]
          : [],
        error: null,
      };
    }
    assert.equal(name, "admin_count_users");
    return { data: 1, error: null };
  }, calls);
  const result = await listUsers({ search: "example", page: 2 });
  assert.deepEqual(result, { ok: true, data: { users: [], total: 1 } });
  assert.deepEqual(calls.map((call) => call.name), ["admin_list_users", "admin_count_users"]);
});

test("listUsers maps count errors on empty pages", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  installService(async (name) => {
    if (name === "admin_list_users") {
      return { data: [], error: null };
    }
    return { data: null, error: new Error("rpc failed: invalid_role") };
  }, calls);
  assert.deepEqual(await listUsers({ role: "superadmin" }), { ok: false, code: "invalid_role" });
});

test("listUsers maps invalid_role and unknown errors", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  installService(async () => rpcError("invalid_role"), calls);
  assert.deepEqual(await listUsers({ role: "superadmin" }), { ok: false, code: "invalid_role" });
  installService(async () => ({ data: null, error: new Error("boom") }), calls);
  assert.deepEqual(await listUsers({}), { ok: false, code: "unavailable" });
});
