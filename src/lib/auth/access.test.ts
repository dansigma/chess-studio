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
