import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "@/src/test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Course } from "./types.ts";

let recordEnrollmentCalls = 0;
let saveProgressCalls = 0;

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push: () => {} }),
    usePathname: () => "/admin/courses/11111111-1111-4111-8111-111111111111/preview/v1",
  },
});

mock.module("@/src/lib/supabase/client.ts", {
  namedExports: {
    createBrowserSupabase: () => ({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    }),
  },
});

mock.module("@/src/courses/publish.ts", {
  namedExports: {
    currentUserRole: async () => "admin",
  },
});

mock.module("@/app/admin/courses/actions.ts", {
  namedExports: {
    reviewQueueCountAction: async () => ({ ok: true as const, data: { count: 0 } }),
  },
});

mock.module("@/src/courses/use-courses.ts", {
  namedExports: {
    useCourseData: () => ({
      progress: {},
      admin: true,
      isAdmin: true,
      ready: true,
      signedIn: true,
      userId: "admin-1",
      source: "account" as const,
      setProgress: () => {},
    }),
  },
});

mock.module("@/src/courses/enrollment.ts", {
  namedExports: {
    checkCourseAccess: async () => true,
    recordEnrollment: async () => {
      recordEnrollmentCalls += 1;
    },
    recordCompletion: async () => {},
    shouldRecordCompletion: () => false,
    resetEnrollmentSession: () => {},
  },
});

const realStore = await import("./store.ts");
mock.module("@/src/courses/store.ts", {
  namedExports: {
    ...realStore,
    saveVariationProgress: async () => {
      saveProgressCalls += 1;
      return null;
    },
  },
});

const { LessonView } = await import("./LessonView.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

// Playing as Black with 1. e4 as the sole move makes Forward advance straight to the summary.
const COURSE: Course = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "sicilian-review",
  title: "Sicilian Defense",
  summary: "",
  theme: "openings",
  color: "black",
  status: "in_review",
  accessTier: "free",
  priceCents: null,
  level: "beginner",
  eloMin: null,
  eloMax: null,
  language: "en",
  durationMinutes: null,
  builtin: false,
  contentLoaded: true,
  chapters: [
    {
      id: "ch1",
      title: "Open Sicilian",
      variations: [
        { id: "v1", title: "Line One", pgn: "1. e4 *" },
        { id: "v2", title: "Line Two", pgn: "1. d4 *" },
      ],
    },
  ],
};

function setTestUrl(path: string) {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
    `http://localhost${path}`,
  );
}

before(() => {
  setupDom();
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  recordEnrollmentCalls = 0;
  saveProgressCalls = 0;
  setTestUrl(`/admin/courses/${COURSE.id}/preview/v1`);
  act(() => {
    useStudioStore.setState({
      settings: { ...DEFAULT_SETTINGS, locale: "en", moveSound: false },
    });
  });
});

test("LessonView in preview mode shows banner, rewrites header/next links, and skips enrollment & progress writes", async () => {
  const basePath = `/admin/courses/${COURSE.id}/preview`;
  const { container } = render(
    <LessonView
      course={COURSE}
      variationId="v1"
      previewBasePath={basePath}
      previewQueueHref="/admin/courses"
    />,
  );
  await Promise.resolve();
  await Promise.resolve();

  const banner = container.querySelector("[data-admin-preview-banner]");
  assert.ok(banner, "preview banner should be rendered");
  assert.equal(screen.getByRole("link", { name: "Back to review queue" }).getAttribute("href"), "/admin/courses");

  // Header breadcrumbs & segment links point under previewBasePath.
  assert.equal(screen.getByRole("link", { name: "Sicilian Defense" }).getAttribute("href"), basePath);
  assert.equal(screen.getByRole("link", { name: "Open Sicilian" }).getAttribute("href"), basePath);
  const segmentHrefs = [...container.querySelectorAll("a[data-segment]")].map((a) => a.getAttribute("href"));
  assert.deepEqual(segmentHrefs, [`${basePath}/v1`, `${basePath}/v2`]);

  // Advance through the opponent move to finish Learn mode, then switch to Train and finish to inspect next-line link.
  fireEvent.click(screen.getByRole("button", { name: "Forward" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue to Review" }));
  fireEvent.click(screen.getByRole("button", { name: "Forward" }));

  const nextLink = container.querySelector("a[data-lesson-next]");
  assert.equal(nextLink?.getAttribute("href"), `${basePath}/v2`);

  assert.equal(recordEnrollmentCalls, 0);
  assert.equal(saveProgressCalls, 0);
});

test("LessonView in preview mode links the last variation's next button back to the preview course page", async () => {
  const basePath = `/admin/courses/${COURSE.id}/preview`;
  setTestUrl(`${basePath}/v2?modo=treinar`);
  const { container } = render(
    <LessonView
      course={COURSE}
      variationId="v2"
      previewBasePath={basePath}
      previewQueueHref="/admin/courses"
    />,
  );
  await Promise.resolve();

  fireEvent.click(screen.getByRole("button", { name: "Forward" }));
  const nextLink = container.querySelector("a[data-lesson-next]");
  assert.equal(nextLink?.getAttribute("href"), basePath);
  assert.equal(nextLink?.getAttribute("data-course-end"), "true");
  assert.equal(recordEnrollmentCalls, 0);
  assert.equal(saveProgressCalls, 0);
});
