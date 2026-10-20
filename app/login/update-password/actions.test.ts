// Tests for the update-password server action: session requirement,
// server-side password policy, rate limiting, and the happy path.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createFakeSupabase,
  mockSupabaseModules,
  nextTestIp,
  setRequestHeaders,
} from "@/src/test-utils/route-test.ts";

const serverState: { server?: unknown } = {};
mockSupabaseModules(serverState);

const { updatePassword } = await import("./actions.ts");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.append(key, value);
  }
  return data;
}

function withRequest(ip = nextTestIp()) {
  setRequestHeaders(new Headers({ "x-forwarded-for": ip }));
}

function server(
  userId: string | null,
  updateUser?: () => Promise<unknown>,
) {
  const fake = createFakeSupabase({
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
      updateUser: updateUser ?? (async () => ({ data: { user: { id: userId } }, error: null })),
    },
  });
  serverState.server = fake;
  return fake;
}

function updateCalls(fake: ReturnType<typeof server>) {
  return fake.authCalls.filter((call) => call.method === "updateUser");
}

const GOOD = { password: "long-enough-pw", confirm: "long-enough-pw" };

test("update without a session is rejected and never calls updateUser", async () => {
  const fake = server(null);
  withRequest();
  const state = await updatePassword({}, form(GOOD));
  assert.match(state.error ?? "", /invalid or has expired/);
  assert.equal(updateCalls(fake).length, 0);
});

test("password below the minimum is rejected server-side without calling updateUser", async () => {
  const fake = server("user-short");
  withRequest();
  const state = await updatePassword({}, form({ password: "short", confirm: "short" }));
  assert.deepEqual(state, { error: "Password must be at least 10 characters." });
  assert.equal(updateCalls(fake).length, 0);
});

test("mismatched confirmation is rejected without calling updateUser", async () => {
  const fake = server("user-mismatch");
  withRequest();
  const state = await updatePassword({}, form({ password: "long-enough-pw", confirm: "different-pw!" }));
  assert.deepEqual(state, { error: "Passwords don't match." });
  assert.equal(updateCalls(fake).length, 0);
});

test("valid password with a session calls updateUser", async () => {
  const fake = server("user-ok");
  withRequest();
  const state = await updatePassword({}, form(GOOD));
  assert.equal(state.error, undefined);
  assert.match(state.message ?? "", /Password updated/);
  const calls = updateCalls(fake);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [{ password: "long-enough-pw" }]);
});

test("updateUser failure maps to a generic error", async () => {
  server("user-fail", async () => ({ data: null, error: new Error("weak_password internals") }));
  withRequest();
  const state = await updatePassword({}, form(GOOD));
  assert.deepEqual(state, { error: "Could not update the password. Try again." });
});

test("password updates are rate-limited per user", async () => {
  const fake = server("user-limited");
  let last: { error?: string } = {};
  for (let i = 0; i < 11; i += 1) {
    withRequest();
    last = await updatePassword({}, form(GOOD));
  }
  assert.deepEqual(last, { error: "Too many attempts. Wait a few minutes and try again." });
  assert.equal(updateCalls(fake).length, 10);
});

test("invalid submissions do not use up the rate-limit quota", async () => {
  const fake = server("user-typos");
  const ip = nextTestIp();
  for (let i = 0; i < 15; i += 1) {
    withRequest(ip);
    await updatePassword({}, form({ password: "short", confirm: "short" }));
  }
  withRequest(ip);
  const state = await updatePassword({}, form(GOOD));
  assert.match(state.message ?? "", /Password updated/);
  assert.equal(updateCalls(fake).length, 1);
});

test("password updates are rate-limited per IP across users", async () => {
  const ip = nextTestIp();
  let last: { error?: string } = {};
  let calls = 0;
  for (let i = 0; i < 11; i += 1) {
    const fake = server(`user-ip-${i}`);
    withRequest(ip);
    last = await updatePassword({}, form(GOOD));
    calls += updateCalls(fake).length;
  }
  assert.deepEqual(last, { error: "Too many attempts. Wait a few minutes and try again." });
  assert.equal(calls, 10);
});

test("the new password is trimmed like at sign-in", async () => {
  const fake = server("user-trim");
  withRequest();
  await updatePassword({}, form({ password: "  long-enough-pw  ", confirm: "long-enough-pw" }));
  assert.deepEqual(updateCalls(fake)[0].args, [{ password: "long-enough-pw" }]);
});
