// Tests for the OAuth callback: code exchange, `finishSignIn` handoff, and
// safe-`next` redirects (see `.artifacts/plans/issue-932.md` Phase 2).
import test from "node:test";
import assert from "node:assert/strict";
import {
  createFakeSupabase,
  makeGetRequest,
  mockFinishSignIn,
  mockSupabaseModules,
  nextTestIp,
} from "@/src/test-utils/route-test.ts";

const serverState: { server?: unknown } = {};
mockSupabaseModules(serverState);

const signInCalls: Array<{ id: string; email: unknown; confirmed: unknown }> = [];
mockFinishSignIn(async (userId: string, email: unknown, confirmed: unknown) => {
  signInCalls.push({ id: userId, email, confirmed });
});

const { GET } = await import("./route.ts");

function user(overrides = {}) {
  return {
    id: "user-1",
    email: "player@example.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function serverWithExchange(result: unknown) {
  serverState.server = createFakeSupabase({
    auth: { exchangeCodeForSession: async () => result },
  });
}

test("exchange success calls finishSignIn with (id, email, confirmed) and safe next", async () => {
  signInCalls.length = 0;
  serverWithExchange({ data: { user: user() }, error: null });
  const res = await GET(makeGetRequest("http://x/auth/callback?code=abc&next=/courses", nextTestIp()));
  assert.deepEqual(signInCalls, [
    { id: "user-1", email: "player@example.com", confirmed: "2026-01-01T00:00:00Z" },
  ]);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("Location"), "http://x/courses");
});

test("exchange error redirects to /login?error=auth without finishSignIn", async () => {
  signInCalls.length = 0;
  serverWithExchange({ data: { user: null }, error: new Error("bad code") });
  const res = await GET(
    makeGetRequest("http://x/auth/callback?code=bad&next=/courses", nextTestIp()),
  );
  assert.deepEqual(signInCalls, []);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("Location"), "http://x/login?error=auth");
});

test("missing code skips exchange and redirects to safe next", async () => {
  signInCalls.length = 0;
  const fake = createFakeSupabase();
  serverState.server = fake;
  const res = await GET(makeGetRequest("http://x/auth/callback?next=/studio", nextTestIp()));
  assert.deepEqual(fake.authCalls, [], "no Supabase auth calls without a code");
  assert.deepEqual(signInCalls, []);
  assert.equal(res.headers.get("Location"), "http://x/studio");
});

test("evil next falls back to /studio", async () => {
  serverWithExchange({ data: { user: user() }, error: null });
  const res = await GET(
    makeGetRequest("http://x/auth/callback?code=abc&next=https://evil.example", nextTestIp()),
  );
  assert.equal(res.headers.get("Location"), "http://x/studio");
});
