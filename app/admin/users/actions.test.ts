// Tests for the admin users server actions (SIG-1061): admin gating via the
// real getRole, validation before RPC, error-code passthrough, and the
// best-effort app_metadata clear on admin demotion.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  createFakeSupabase,
  nextTestIp,
  setRequestHeaders,
} from "@/src/test-utils/route-test.ts";

const serverState: { server?: unknown } = {};
const serviceState: { service?: unknown } = {};
// NOTE: mockSupabaseModules() cannot be used here — it already mocks
// @/src/lib/supabase/admin.ts, and node:test forbids double-mocking. Both
// boundaries are mocked once, manually, with per-test holders instead.
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

const { changeRoleAction, listUsersAction } = await import("./actions.ts");

function withRequest(ip = nextTestIp()) {
  setRequestHeaders(new Headers({ "x-forwarded-for": ip }));
}

function server(user: { id: string; email?: string; email_confirmed_at?: string | null } | null, profileRole: unknown) {
  const fake = createFakeSupabase({
    tables: { profiles: { maybeSingle: profileRole === null ? null : { role: profileRole } } },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  });
  serverState.server = fake;
  return fake;
}

function service(handler: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  const rpc: Array<{ name: string; args: Record<string, unknown> }> = [];
  const updateUserById: Array<{ id: string; attrs: unknown }> = [];
  let updateUserError: unknown = null;
  serviceState.service = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpc.push({ name, args });
      return handler(name, args);
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: unknown) => {
          updateUserById.push({ id, attrs });
          return { data: null, error: updateUserError };
        },
      },
    },
  };
  return { rpc, updateUserById, failUpdate: () => { updateUserError = new Error("meta write failed"); } };
}

const ADMIN = { id: "admin-1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const STUDENT = { id: "student-1", email: "kid@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

function serviceOk(oldRole = "student") {
  return service(async () => ({ data: oldRole, error: null }));
}

function serviceErr(code: string) {
  return service(async () => ({ data: null, error: new Error(`rpc failed: ${code}`) }));
}

test("signed-out caller gets forbidden without touching the service client", async () => {
  server(null, null);
  const svc = serviceOk();
  withRequest();
  assert.deepEqual(await listUsersAction({}), { ok: false, code: "forbidden" });
  withRequest();
  assert.deepEqual(
    await changeRoleAction({ userId: "u1", newRole: "coach", reason: "needs coaching access" }),
    { ok: false, code: "forbidden" },
  );
  assert.equal(svc.rpc.length, 0);
});

test("student caller gets forbidden without touching the service client", async () => {
  server(STUDENT, "student");
  const svc = serviceOk();
  withRequest();
  assert.deepEqual(await listUsersAction({}), { ok: false, code: "forbidden" });
  withRequest();
  assert.deepEqual(
    await changeRoleAction({ userId: "u1", newRole: "coach", reason: "needs coaching access" }),
    { ok: false, code: "forbidden" },
  );
  assert.equal(svc.rpc.length, 0);
});

test("admin caller lists users through the service RPC", async () => {
  server(ADMIN, "admin");
  const rows = [{ id: "u1", email: "a@example.com", role: "coach", created_at: "2026-01-01", email_confirmed: true, total: 1 }];
  const svc = service(async (name) => {
    assert.equal(name, "admin_list_users");
    return { data: rows, error: null };
  });
  withRequest();
  assert.deepEqual(await listUsersAction({ search: "a", page: 1 }), {
    ok: true,
    data: { users: rows, total: 1 },
  });
  assert.equal(svc.rpc.length, 1);
});

test("changeRoleAction maps each RPC error code", async () => {
  for (const code of ["invalid_role", "invalid_reason", "not_found", "own_role", "unchanged", "last_admin"]) {
    server(ADMIN, "admin");
    serviceErr(code);
    withRequest();
    const result = await changeRoleAction({ userId: "u1", newRole: "coach", reason: "needs coaching access" });
    assert.deepEqual(result, { ok: false, code });
  }
});

test("invalid inputs are rejected before the RPC runs", async () => {
  server(ADMIN, "admin");
  const svc = serviceOk();
  withRequest();
  assert.deepEqual(
    await changeRoleAction({ userId: "u1", newRole: "superadmin", reason: "needs coaching access" }),
    { ok: false, code: "invalid_role" },
  );
  withRequest();
  assert.deepEqual(
    await changeRoleAction({ userId: "u1", newRole: "coach", reason: "no" }),
    { ok: false, code: "invalid_reason" },
  );
  withRequest();
  assert.deepEqual(await listUsersAction({ role: "superadmin" }), { ok: false, code: "invalid_role" });
  assert.equal(svc.rpc.length, 0);
});

test("successful admin demotion clears app_metadata.role", async () => {
  server(ADMIN, "admin");
  const svc = serviceOk("admin");
  withRequest();
  const result = await changeRoleAction({ userId: "u1", newRole: "coach", reason: "stepping down" });
  assert.deepEqual(result, { ok: true, data: { oldRole: "admin" } });
  assert.deepEqual(svc.updateUserById, [{ id: "u1", attrs: { app_metadata: { role: null } } }]);
});

test("promotion and non-admin changes leave app_metadata untouched", async () => {
  server(ADMIN, "admin");
  const svc = serviceOk("student");
  withRequest();
  const result = await changeRoleAction({ userId: "u1", newRole: "coach", reason: "needs coaching access" });
  assert.deepEqual(result, { ok: true, data: { oldRole: "student" } });
  assert.equal(svc.updateUserById.length, 0);
});

test("failed app_metadata clear still returns success", async () => {
  server(ADMIN, "admin");
  const svc = serviceOk("admin");
  svc.failUpdate();
  withRequest();
  const result = await changeRoleAction({ userId: "u1", newRole: "coach", reason: "stepping down" });
  assert.deepEqual(result, { ok: true, data: { oldRole: "admin" } });
  assert.equal(svc.updateUserById.length, 1);
});
