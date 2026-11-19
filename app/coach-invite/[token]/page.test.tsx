import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { setupDom, teardownDom } from "@/src/test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { createFakeSupabase } from "@/src/test-utils/route-test.ts";
import { redirect, redirectUrl } from "@/src/test-utils/stubs/next-navigation.ts";

const serverState: { server?: unknown } = {};
let acceptInviteCalls = 0;
let actionCalls = 0;

mock.module("next/navigation", {
  namedExports: {
    redirect,
    useRouter: () => ({ push: () => {} }),
    usePathname: () => "/coach-invite/tok-get",
  },
});

mock.module("@/src/lib/supabase/server.ts", {
  namedExports: {
    createServerSupabase: async () => serverState.server ?? null,
    createPublicServerSupabase: () => null,
  },
});

mock.module("@/src/lib/supabase/client.ts", {
  namedExports: {
    createBrowserSupabase: () => null,
  },
});

mock.module("@/src/courses/publish.ts", {
  namedExports: {
    currentUserRole: async () => null,
  },
});

mock.module("@/app/admin/courses/actions.ts", {
  namedExports: {
    reviewQueueCountAction: async () => ({ ok: true as const, data: { count: 0 } }),
  },
});

mock.module("@/src/lib/admin/coach-invites.ts", {
  namedExports: {
    CoachInviteError: class extends Error {},
    acceptInvite: async () => {
      acceptInviteCalls += 1;
      return { ok: true, code: "accepted" };
    },
  },
});

mock.module("@/app/coach-invite/[token]/actions.ts", {
  namedExports: {
    acceptCoachInviteAction: async () => {
      actionCalls += 1;
      return { status: "done", code: "accepted" };
    },
  },
});

const { default: CoachInvitePage } = await import("./page.tsx");

before(() => {
  setupDom();
});

after(async () => {
  await teardownDom();
});

test("GET page redirects unauthenticated callers without calling acceptInvite", async () => {
  acceptInviteCalls = 0;
  actionCalls = 0;
  serverState.server = createFakeSupabase({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  });

  let thrown: unknown;
  try {
    await CoachInvitePage({ params: Promise.resolve({ token: "tok-anon" }) });
  } catch (error) {
    thrown = error;
  }

  assert.equal(redirectUrl(thrown), "/login?next=%2Fcoach-invite%2Ftok-anon");
  assert.equal(acceptInviteCalls, 0);
  assert.equal(actionCalls, 0);
});

test("GET page renders confirmation card with SiteHeader and never calls acceptInvite or action", async () => {
  acceptInviteCalls = 0;
  actionCalls = 0;
  serverState.server = createFakeSupabase({
    auth: {
      getUser: async () => ({
        data: { user: { id: "u-1", email: "coach@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" } },
        error: null,
      }),
    },
  });

  try {
    const element = await CoachInvitePage({ params: Promise.resolve({ token: "tok-get" }) });
    render(element);

    assert.ok(screen.getByRole("banner"));
    assert.ok(screen.getByRole("heading", { name: "Coach invite" }));
    assert.ok(screen.getByText(/coach@example\.com/));
    assert.ok(screen.getByRole("button", { name: "Accept coach invite" }));
    assert.equal(acceptInviteCalls, 0);
    assert.equal(actionCalls, 0);
  } finally {
    cleanup();
  }
});
