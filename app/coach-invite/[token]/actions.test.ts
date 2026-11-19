import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase, nextTestIp, setRequestHeaders } from "@/src/test-utils/route-test.ts";
import { redirectUrl } from "@/src/test-utils/stubs/next-navigation.ts";

class MockCoachInviteError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`coach invite failed: ${code}`);
    this.name = "CoachInviteError";
    this.code = code;
  }
}

const serverState: { server?: unknown } = {};
const inviteState: {
  calls: Array<{ token: string; userId: string; email: string; emailConfirmedAt: string | null | undefined }>;
  handler?: (options: {
    token: string;
    userId: string;
    email: string;
    emailConfirmedAt: string | null | undefined;
  }) => Promise<{ ok: boolean; code: string }>;
} = { calls: [] };

mock.module("@/src/lib/supabase/server.ts", {
  namedExports: {
    createServerSupabase: async () => serverState.server ?? null,
    createPublicServerSupabase: () => null,
  },
});

mock.module("@/src/lib/admin/coach-invites.ts", {
  namedExports: {
    CoachInviteError: MockCoachInviteError,
    acceptInvite: async (options: {
      token: string;
      userId: string;
      email: string;
      emailConfirmedAt: string | null | undefined;
    }) => {
      inviteState.calls.push(options);
      if (inviteState.handler) {
        return inviteState.handler(options);
      }
      return { ok: true, code: "accepted" };
    },
  },
});

const { acceptCoachInviteAction } = await import("./actions.ts");

function withRequest(ip = nextTestIp()) {
  setRequestHeaders(new Headers({ "x-forwarded-for": ip }));
}

function setAuthUser(user: { id: string; email?: string; email_confirmed_at?: string | null } | null) {
  serverState.server = createFakeSupabase({
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  });
}

const USER = {
  id: "user-1",
  email: "coach@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
};

test("unauthenticated caller redirects to login with next and never calls acceptInvite", async () => {
  setAuthUser(null);
  inviteState.calls = [];
  withRequest();

  let thrown: unknown;
  try {
    await acceptCoachInviteAction("tok-123");
  } catch (error) {
    thrown = error;
  }

  assert.equal(redirectUrl(thrown), "/login?next=%2Fcoach-invite%2Ftok-123");
  assert.equal(inviteState.calls.length, 0);
});

test("empty or non-string token returns invalid without consuming the rate limiter", async () => {
  setAuthUser(USER);
  inviteState.calls = [];
  inviteState.handler = async () => ({ ok: true, code: "accepted" });

  const ip = nextTestIp();
  // Exhausting more than the 10-req quota with invalid tokens must not burn the bucket.
  for (let i = 0; i < 12; i += 1) {
    withRequest(ip);
    const bad = i % 2 === 0 ? "" : ("   " as string);
    assert.deepEqual(await acceptCoachInviteAction(bad), {
      status: "done",
      code: "invalid",
    });
  }
  withRequest(ip);
  assert.deepEqual(
    await acceptCoachInviteAction(null as unknown as string),
    { status: "done", code: "invalid" },
  );
  assert.equal(inviteState.calls.length, 0);

  // A subsequent valid token on the same IP still succeeds.
  withRequest(ip);
  assert.deepEqual(await acceptCoachInviteAction("valid-token"), {
    status: "done",
    code: "accepted",
  });
  assert.equal(inviteState.calls.length, 1);
});

test("rate limiter rejects after 10 attempts per IP without calling acceptInvite", async () => {
  setAuthUser(USER);
  inviteState.calls = [];
  inviteState.handler = async () => ({ ok: true, code: "accepted" });

  const ip = nextTestIp();
  for (let i = 0; i < 10; i += 1) {
    withRequest(ip);
    const result = await acceptCoachInviteAction(`tok-${i}`);
    assert.deepEqual(result, { status: "done", code: "accepted" });
  }
  assert.equal(inviteState.calls.length, 10);

  withRequest(ip);
  const blocked = await acceptCoachInviteAction("tok-11");
  assert.deepEqual(blocked, { status: "done", code: "rate_limited" });
  assert.equal(inviteState.calls.length, 10);
});

test("valid submission calls acceptInvite once with user fields and maps result codes", async () => {
  setAuthUser(USER);
  inviteState.calls = [];
  inviteState.handler = async () => ({ ok: false, code: "expired" });
  withRequest();

  const result = await acceptCoachInviteAction("tok-abc");
  assert.deepEqual(result, { status: "done", code: "expired" });
  assert.deepEqual(inviteState.calls, [
    {
      token: "tok-abc",
      userId: "user-1",
      email: "coach@example.com",
      emailConfirmedAt: "2026-01-01T00:00:00Z",
    },
  ]);
});

test("thrown CoachInviteError and unexpected errors are mapped safely", async () => {
  setAuthUser(USER);
  inviteState.calls = [];

  inviteState.handler = async () => {
    throw new MockCoachInviteError("revoked");
  };
  withRequest();
  assert.deepEqual(await acceptCoachInviteAction("tok-revoked"), {
    status: "done",
    code: "revoked",
  });

  // Non-accept admin codes like "forbidden" map to "unavailable".
  inviteState.handler = async () => {
    throw new MockCoachInviteError("forbidden");
  };
  withRequest();
  assert.deepEqual(await acceptCoachInviteAction("tok-forbidden"), {
    status: "done",
    code: "unavailable",
  });

  inviteState.handler = async () => {
    throw new Error("network boom");
  };
  withRequest();
  assert.deepEqual(await acceptCoachInviteAction("tok-boom"), {
    status: "done",
    code: "unavailable",
  });
});
