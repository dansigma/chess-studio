// Tests for the login server actions: reset/signup/signin flows, error
// mapping, rate limiting, `finishSignIn` handoff, and safe-`next` redirects
// (see `.artifacts/plans/issue-932.md` Phase 2).
import test from "node:test";
import assert from "node:assert/strict";
import {
  createFakeSupabase,
  mockFinishSignIn,
  mockSupabaseModules,
  nextTestIp,
  setRequestHeaders,
} from "@/src/test-utils/route-test.ts";
import { redirectUrl } from "@/src/test-utils/stubs/next-navigation.ts";

delete process.env.NEXT_PUBLIC_SITE_URL;

const serverState: { server?: unknown } = {};
mockSupabaseModules(serverState);

const signInCalls: Array<{ id: string; email: unknown; confirmed: unknown }> = [];
mockFinishSignIn(async (userId: string, email: unknown, confirmed: unknown) => {
  signInCalls.push({ id: userId, email, confirmed });
});

const { submitAuth, signOut } = await import("./actions.ts");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.append(key, value);
  }
  return data;
}

/** Headers for one request: unique IP (isolates the in-memory limiter). */
function withRequest(ip = nextTestIp()) {
  const headers = new Headers({
    origin: "http://app.test",
    "x-forwarded-for": ip,
  });
  setRequestHeaders(headers);
}

function serverWithAuth(handlers: Record<string, (...args: never[]) => Promise<unknown>>) {
  const fake = createFakeSupabase({ auth: handlers });
  serverState.server = fake;
  return fake;
}

test("unconfigured Supabase returns an error", async () => {
  serverState.server = null;
  withRequest();
  const state = await submitAuth({}, form({ mode: "signin", email: "a@b.c", password: "secret1" }));
  assert.deepEqual(state, { error: "Supabase is not configured." });
});

test("missing email is rejected before any Supabase call", async () => {
  const fake = serverWithAuth({});
  withRequest();
  const state = await submitAuth({}, form({ mode: "signin", email: "", password: "secret1" }));
  assert.deepEqual(state, { error: "Enter an email address." });
  assert.deepEqual(fake.authCalls, []);
});

test("reset success returns the generic message", async () => {
  const fake = serverWithAuth({
    resetPasswordForEmail: async () => ({ error: null }),
  });
  withRequest();
  const state = await submitAuth({}, form({ mode: "reset", email: "Player@Example.com" }));
  assert.deepEqual(state, {
    message: "If an account exists for that email, a reset link is on its way.",
  });
  assert.equal(fake.authCalls.length, 1);
  assert.equal(fake.authCalls[0].method, "resetPasswordForEmail");
  const [emailArg, optionsArg] = fake.authCalls[0].args as [string, { redirectTo: string }];
  assert.equal(emailArg, "player@example.com");
  assert.equal(
    optionsArg.redirectTo,
    "http://app.test/auth/callback?next=%2Flogin%2Fupdate-password",
  );
});

test("reset upstream error maps to a generic message", async () => {
  serverWithAuth({ resetPasswordForEmail: async () => ({ error: new Error("boom") }) });
  withRequest();
  const state = await submitAuth({}, form({ mode: "reset", email: "a@b.c" }));
  assert.deepEqual(state, { error: "Could not send the reset link. Try again." });
});

test("reset rate-limits after 10 attempts from one IP", async () => {
  serverWithAuth({ resetPasswordForEmail: async () => ({ error: null }) });
  const ip = nextTestIp();
  let last = {};
  for (let i = 0; i < 11; i += 1) {
    withRequest(ip);
    last = await submitAuth({}, form({ mode: "reset", email: "a@b.c" }));
  }
  assert.deepEqual(last, { error: "Too many attempts. Wait a few minutes and try again." });
});

test("signup calls signUp with emailRedirectTo containing the safe next", async () => {
  const fake = serverWithAuth({ signUp: async () => ({ error: null }) });
  withRequest();
  const state = await submitAuth(
    {},
    form({ mode: "signup", email: "new@example.com", password: "secret1", next: "/courses" }),
  );
  assert.deepEqual(state, {
    message: "Check your email to confirm your account, then sign in.",
  });
  assert.equal(fake.authCalls.length, 1);
  const [creds] = fake.authCalls[0].args as [
    { email: string; password: string; options: { emailRedirectTo: string } },
  ];
  assert.equal(creds.email, "new@example.com");
  assert.equal(
    creds.options.emailRedirectTo,
    "http://app.test/auth/callback?next=%2Fcourses",
  );
});

test("signup upstream error maps to a generic message", async () => {
  serverWithAuth({ signUp: async () => ({ error: new Error("taken") }) });
  withRequest();
  const state = await submitAuth(
    {},
    form({ mode: "signup", email: "new@example.com", password: "secret1" }),
  );
  assert.deepEqual(state, { error: "Could not create the account. Try again." });
});

test("short password is rejected", async () => {
  const fake = serverWithAuth({});
  withRequest();
  const state = await submitAuth(
    {},
    form({ mode: "signin", email: "a@b.c", password: "abc" }),
  );
  assert.deepEqual(state, { error: "Password must be at least 6 characters." });
  assert.deepEqual(fake.authCalls, []);
});

test("invalid credentials map to a friendly message", async () => {
  serverWithAuth({
    signInWithPassword: async () => ({ data: {}, error: new Error("Invalid login credentials") }),
  });
  withRequest();
  const state = await submitAuth(
    {},
    form({ mode: "signin", email: "a@b.c", password: "secret1" }),
  );
  assert.deepEqual(state, { error: "Email or password is incorrect." });
});

test("unconfirmed email maps to the confirm-email message", async () => {
  serverWithAuth({
    signInWithPassword: async () => ({ data: {}, error: new Error("Email not confirmed") }),
  });
  withRequest();
  const state = await submitAuth(
    {},
    form({ mode: "signin", email: "a@b.c", password: "secret1" }),
  );
  assert.deepEqual(state, { error: "Confirm your email, then sign in." });
});

test("signin success hands (id, email, confirmed) to finishSignIn then redirects", async () => {
  signInCalls.length = 0;
  serverWithAuth({
    signInWithPassword: async () => ({
      data: {
        user: {
          id: "user-9",
          email: "player@example.com",
          email_confirmed_at: "2026-02-02T00:00:00Z",
        },
      },
      error: null,
    }),
  });
  withRequest();
  const thrown = await submitAuth(
    {},
    form({ mode: "signin", email: "player@example.com", password: "secret1", next: "/courses" }),
  ).then(
    () => null,
    (error: unknown) => error,
  );
  assert.deepEqual(signInCalls, [
    { id: "user-9", email: "player@example.com", confirmed: "2026-02-02T00:00:00Z" },
  ]);
  assert.equal(redirectUrl(thrown), "/courses");
});

test("signin success with an evil next redirects to /studio", async () => {
  serverWithAuth({
    signInWithPassword: async () => ({
      data: {
        user: { id: "user-9", email: "player@example.com", email_confirmed_at: null },
      },
      error: null,
    }),
  });
  withRequest();
  const thrown = await submitAuth(
    {},
    form({ mode: "signin", email: "player@example.com", password: "secret1", next: "//evil" }),
  ).then(
    () => null,
    (error: unknown) => error,
  );
  assert.equal(redirectUrl(thrown), "/studio");
});

test("signOut signs out then redirects to /login", async () => {
  const fake = serverWithAuth({ signOut: async () => ({ error: null }) });
  withRequest();
  const thrown = await signOut().then(
    () => null,
    (error: unknown) => error,
  );
  assert.deepEqual(
    fake.authCalls.map((call) => call.method),
    ["signOut"],
  );
  assert.equal(redirectUrl(thrown), "/login");
});
