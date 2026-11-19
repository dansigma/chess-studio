import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "@/src/test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createFakeSupabase } from "@/src/test-utils/route-test.ts";
import { redirect, redirectUrl } from "@/src/test-utils/stubs/next-navigation.ts";

const NOT_FOUND_SENTINEL = "NEXT_NOT_FOUND";
const serverState: { server?: unknown } = {};
const serviceState: { service?: unknown } = {};

mock.module("next/navigation", {
  namedExports: {
    redirect,
    notFound: (): never => {
      throw new Error(NOT_FOUND_SENTINEL);
    },
    useRouter: () => ({ push: () => {} }),
    usePathname: () => `/admin/courses/${COURSE_ID}/preview/v1`,
  },
});

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

mock.module("@/src/lib/supabase/client.ts", {
  namedExports: {
    createBrowserSupabase: () => null,
  },
});

mock.module("@/src/courses/publish.ts", {
  namedExports: {
    currentUserRole: async () => "admin",
  },
});

const { default: AdminCourseVariationPreviewPage } = await import("./page.tsx");

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN = { id: "admin-1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const COACH = { id: "coach-1", email: "coach@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

const COURSE_ROW = {
  id: COURSE_ID,
  slug: "london-review",
  title: "London System",
  summary: "Solid.",
  color: "white",
  theme: "openings",
  chapters: [
    {
      id: "ch1",
      title: "Main Setup",
      variations: [{ id: "v1", title: "1. d4 d5 2. Bf4", pgn: "1. d4 d5 2. Bf4 *" }],
    },
  ],
  cover_url: null,
  video_url: null,
  published_at: null,
  status: "in_review",
  access_tier: "free",
  price_cents: null,
};

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === NOT_FOUND_SENTINEL;
}

before(() => {
  setupDom();
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  serverState.server = undefined;
  serviceState.service = undefined;
});

test("anonymous visitor redirects to /login with next pointing to the preview variation", async () => {
  serverState.server = createFakeSupabase({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  });

  let thrown: unknown;
  try {
    await AdminCourseVariationPreviewPage({
      params: Promise.resolve({ id: COURSE_ID, variationId: "v1" }),
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(redirectUrl(thrown), `/login?next=/admin/courses/${COURSE_ID}/preview/v1`);
});

test("non-admin user redirects to /courses", async () => {
  serverState.server = createFakeSupabase({
    tables: { profiles: { maybeSingle: { role: "coach" } } },
    auth: { getUser: async () => ({ data: { user: COACH }, error: null }) },
  });

  let thrown: unknown;
  try {
    await AdminCourseVariationPreviewPage({
      params: Promise.resolve({ id: COURSE_ID, variationId: "v1" }),
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(redirectUrl(thrown), "/courses");
});

test("unknown variationId triggers notFound()", async () => {
  serverState.server = createFakeSupabase({
    tables: { profiles: { maybeSingle: { role: "admin" } } },
    auth: { getUser: async () => ({ data: { user: ADMIN }, error: null }) },
  });
  serviceState.service = createFakeSupabase({
    tables: { courses: { maybeSingle: COURSE_ROW } },
  });

  let thrown: unknown;
  try {
    await AdminCourseVariationPreviewPage({
      params: Promise.resolve({ id: COURSE_ID, variationId: "missing-var" }),
    });
  } catch (error) {
    thrown = error;
  }

  assert.equal(isNotFoundError(thrown), true);
});

test("admin with valid course and variation renders LessonView in preview mode", async () => {
  serverState.server = createFakeSupabase({
    tables: { profiles: { maybeSingle: { role: "admin" } } },
    auth: { getUser: async () => ({ data: { user: ADMIN }, error: null }) },
  });
  serviceState.service = createFakeSupabase({
    tables: { courses: { maybeSingle: COURSE_ROW } },
  });

  const element = await AdminCourseVariationPreviewPage({
    params: Promise.resolve({ id: COURSE_ID, variationId: "v1" }),
  });
  const rendered = render(element);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const { container } = rendered;

  assert.ok(container.querySelector("[data-admin-preview-banner]"));
  assert.equal(screen.getByRole("link", { name: "Back to review queue" }).getAttribute("href"), "/admin/courses");
  assert.equal(
    screen.getByRole("link", { name: "London System" }).getAttribute("href"),
    `/admin/courses/${COURSE_ID}/preview`,
  );
  const segment = container.querySelector("a[data-segment]");
  assert.equal(segment?.getAttribute("href"), `/admin/courses/${COURSE_ID}/preview/v1`);
});
