// Unit tests for `finishSignIn` (see `.artifacts/plans/issue-932.md` Phase 2):
// admin role is granted only to listed admins with a confirmed email.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase } from "@/src/test-utils/route-test.ts";

process.env.COURSE_ADMINS = "boss@example.com";

mock.module("@/src/lib/supabase/admin.ts", {
  namedExports: {
    createServiceSupabase: () =>
      (globalThis as { __fakeAdmin?: unknown }).__fakeAdmin ?? null,
  },
});

const { finishSignIn } = await import("@/src/lib/auth/access.ts");

function installAdmin(fake: unknown) {
  (globalThis as { __fakeAdmin?: unknown }).__fakeAdmin = fake;
}

test("listed admin with confirmed email gets admin role", async () => {
  const fake = createFakeSupabase();
  installAdmin(fake);
  await finishSignIn("user-1", "boss@example.com", "2026-01-01T00:00:00Z");
  assert.deepEqual(
    fake.calls.upsert,
    [{ table: "profiles", row: { id: "user-1", role: "admin" } }],
    "admin profile upsert recorded",
  );
  assert.equal(fake.calls.updateUserById.length, 1);
  assert.deepEqual(fake.calls.updateUserById[0], {
    id: "user-1",
    attrs: { app_metadata: { role: "admin" } },
  });
});

test("listed admin with unconfirmed email stays student (no admin writes)", async () => {
  const fake = createFakeSupabase();
  installAdmin(fake);
  await finishSignIn("user-2", "boss@example.com", null);
  assert.deepEqual(fake.calls.upsert, []);
  assert.deepEqual(fake.calls.updateUserById, []);
  assert.deepEqual(
    fake.calls.insert,
    [{ table: "profiles", row: { id: "user-2", role: "student" } }],
    "student profile created instead",
  );
});

test("unlisted email stays student", async () => {
  const fake = createFakeSupabase();
  installAdmin(fake);
  await finishSignIn("user-3", "random@example.com", "2026-01-01T00:00:00Z");
  assert.deepEqual(fake.calls.upsert, []);
  assert.deepEqual(fake.calls.updateUserById, []);
  assert.deepEqual(
    fake.calls.insert,
    [{ table: "profiles", row: { id: "user-3", role: "student" } }],
    "student profile created",
  );
});

test("existing student profile is left untouched (no insert)", async () => {
  const fake = createFakeSupabase({
    tables: { profiles: { maybeSingle: { id: "user-4", role: "student" } } },
  });
  installAdmin(fake);
  await finishSignIn("user-4", "random@example.com", "2026-01-01T00:00:00Z");
  assert.deepEqual(fake.calls.insert, []);
  assert.deepEqual(fake.calls.upsert, []);
});

test("missing service client is a no-op", async () => {
  installAdmin(null);
  await finishSignIn("user-5", "boss@example.com", "2026-01-01T00:00:00Z");
});

test("previously admin (app_metadata), no longer listed: revoked", async () => {
  const fake = createFakeSupabase({ tables: { profiles: { maybeSingle: { id: "u6", role: "admin", role_source: "system" } } } });
  installAdmin(fake);
  await finishSignIn("u6", "random@example.com", "2026-01-01T00:00:00Z", { role: "admin" });
  assert.deepEqual(fake.calls.upsert, [{ table: "profiles", row: { id: "u6", role: "student" } }]);
  assert.deepEqual(fake.calls.updateUserById, [{ id: "u6", attrs: { app_metadata: { role: null } } }]);
});

test("profile admin but no app_metadata role, unlisted: revoked", async () => {
  const fake = createFakeSupabase({ tables: { profiles: { maybeSingle: { id: "u7", role: "admin", role_source: "system" } } } });
  installAdmin(fake);
  await finishSignIn("u7", "random@example.com", "2026-01-01T00:00:00Z", {});
  assert.deepEqual(fake.calls.upsert, [{ table: "profiles", row: { id: "u7", role: "student" } }]);
  assert.equal(fake.calls.updateUserById.length, 1);
});

test("manual admin is never revoked, even with stale app_metadata", async () => {
  const fake = createFakeSupabase({
    tables: { profiles: { maybeSingle: { id: "u7m", role: "admin", role_source: "manual" } } },
  });
  installAdmin(fake);
  await finishSignIn("u7m", "random@example.com", "2026-01-01T00:00:00Z", { role: "admin" });
  assert.deepEqual(fake.calls.upsert, []);
  assert.deepEqual(fake.calls.updateUserById, []);
  assert.deepEqual(fake.calls.insert, []);
});

test("manual admin without app_metadata claim is left untouched", async () => {
  const fake = createFakeSupabase({
    tables: { profiles: { maybeSingle: { id: "u7n", role: "admin", role_source: "manual" } } },
  });
  installAdmin(fake);
  await finishSignIn("u7n", "random@example.com", "2026-01-01T00:00:00Z", {});
  assert.deepEqual(fake.calls.upsert, []);
  assert.deepEqual(fake.calls.updateUserById, []);
  assert.deepEqual(fake.calls.insert, []);
});

test("manual coach with stale app_metadata admin claim is never revoked", async () => {
  const fake = createFakeSupabase({
    tables: { profiles: { maybeSingle: { id: "u7c", role: "coach", role_source: "manual" } } },
  });
  installAdmin(fake);
  await finishSignIn("u7c", "random@example.com", "2026-01-01T00:00:00Z", { role: "admin" });
  assert.deepEqual(fake.calls.upsert, []);
  assert.deepEqual(fake.calls.updateUserById, []);
  assert.deepEqual(fake.calls.insert, []);
});

test("admin whose email is unconfirmed is revoked", async () => {
  const fake = createFakeSupabase({ tables: { profiles: { maybeSingle: { id: "u8", role: "admin", role_source: "system" } } } });
  installAdmin(fake);
  await finishSignIn("u8", "boss@example.com", null, { role: "admin" });
  assert.deepEqual(fake.calls.updateUserById, [{ id: "u8", attrs: { app_metadata: { role: null } } }]);
  assert.deepEqual(fake.calls.upsert, [{ table: "profiles", row: { id: "u8", role: "student" } }]);
});

test("still-listed confirmed admin is not revoked", async () => {
  const fake = createFakeSupabase();
  installAdmin(fake);
  await finishSignIn("u9", "boss@example.com", "2026-01-01T00:00:00Z", { role: "admin" });
  assert.deepEqual(fake.calls.upsert, [{ table: "profiles", row: { id: "u9", role: "admin" } }]);
  assert.deepEqual(fake.calls.updateUserById, [{ id: "u9", attrs: { app_metadata: { role: "admin" } } }]);
});

test("grant write errors are logged with [auth] prefix and not thrown", async () => {
  const errors: unknown[][] = [];
  const spy = mock.method(console, "error", (...args: unknown[]) => {
    errors.push(args);
  });
  try {
    const fake = createFakeSupabase({
      tables: { profiles: { writeError: { message: "boom" } } },
      updateUserError: { message: "auth boom" },
    });
    installAdmin(fake);
    await finishSignIn("u10", "boss@example.com", "2026-01-01T00:00:00Z");
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => String(e[0]).startsWith("[auth]")));
  } finally {
    spy.mock.restore();
  }
});

test("revoke write errors are logged, not thrown", async () => {
  const errors: unknown[][] = [];
  const spy = mock.method(console, "error", (...args: unknown[]) => {
    errors.push(args);
  });
  try {
    const fake = createFakeSupabase({
      tables: { profiles: { maybeSingle: { id: "u11", role: "admin", role_source: "system" }, writeError: { message: "x" } } },
      updateUserError: { message: "y" },
    });
    installAdmin(fake);
    await finishSignIn("u11", "random@example.com", "2026-01-01T00:00:00Z", { role: "admin" });
    assert.equal(errors.length, 2);
  } finally {
    spy.mock.restore();
  }
});

test("course_admins lookup failure leaves the admin role untouched", async () => {
  const spy = mock.method(console, "error", () => {});
  try {
    const fake = createFakeSupabase({
      tables: {
        course_admins: { selectError: { message: "timeout" } },
        profiles: { maybeSingle: { id: "u12", role: "admin", role_source: "system" } },
      },
    });
    installAdmin(fake);
    await finishSignIn("u12", "table-admin@example.com", "2026-01-01T00:00:00Z", { role: "admin" });
    assert.deepEqual(fake.calls.upsert, []);
    assert.deepEqual(fake.calls.updateUserById, []);
    assert.equal(spy.mock.callCount(), 1);
  } finally {
    spy.mock.restore();
  }
});
