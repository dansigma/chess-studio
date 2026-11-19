import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "@/src/test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Course, VariationProgress } from "./types.ts";

let recordEnrollmentCalls = 0;
let checkCourseAccessCalls = 0;
let fakeCourseData = {
  progress: {} as Record<string, VariationProgress>,
  admin: true,
  isAdmin: true,
  ready: true,
  signedIn: true,
  userId: "admin-1" as string | null,
  source: "account" as "account" | "browser",
  setProgress: () => {},
};

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push: () => {} }),
    usePathname: () => "/admin/courses/c1/preview",
    useSearchParams: () => new URLSearchParams(),
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
    useCourseData: () => fakeCourseData,
  },
});

mock.module("@/src/courses/enrollment.ts", {
  namedExports: {
    checkCourseAccess: async () => {
      checkCourseAccessCalls += 1;
      return true;
    },
    recordEnrollment: async () => {
      recordEnrollmentCalls += 1;
    },
    recordCompletion: async () => {},
    shouldRecordCompletion: () => false,
    resetEnrollmentSession: () => {},
  },
});

const { CourseView } = await import("./CourseView.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const COURSE: Course = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "london-review",
  title: "London System",
  summary: "<p>Solid opening.</p>",
  theme: "openings",
  color: "white",
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
      title: "Main Setup",
      variations: [
        { id: "v1", title: "1. d4 d5 2. Bf4", pgn: "1. d4 d5 2. Bf4 *" },
        { id: "v2", title: "1. d4 Nf6 2. Bf4", pgn: "1. d4 Nf6 2. Bf4 *" },
      ],
    },
  ],
};

before(() => {
  setupDom();
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  recordEnrollmentCalls = 0;
  checkCourseAccessCalls = 0;
  fakeCourseData = {
    progress: {
      v1: {
        step: 2,
        learned: true,
        reviewLevel: 1,
        reviewDueAt: "2020-01-01T00:00:00.000Z",
      },
    },
    admin: true,
    isAdmin: true,
    ready: true,
    signedIn: true,
    userId: "admin-1",
    source: "account",
    setProgress: () => {},
  };
  act(() => {
    useStudioStore.setState({
      settings: { ...DEFAULT_SETTINGS, locale: "en" },
    });
  });
});

test("CourseView in preview mode shows banner, uses previewBasePath links, forces full syllabus, and skips recordEnrollment", async () => {
  const basePath = `/admin/courses/${COURSE.id}/preview`;
  const { container } = render(
    <CourseView
      course={COURSE}
      previewBasePath={basePath}
      previewQueueHref="/admin/courses"
    />,
  );
  await Promise.resolve();
  await Promise.resolve();

  const banner = container.querySelector("[data-admin-preview-banner]");
  assert.ok(banner, "preview banner should be rendered");
  assert.match(banner.textContent ?? "", /Preview — this course is awaiting review/);
  const backLink = screen.getByRole("link", { name: "Back to review queue" });
  assert.equal(backLink.getAttribute("href"), "/admin/courses");

  // Full syllabus is shown (no student-progress mode / no progress header or review links).
  assert.equal(screen.queryByRole("region", { name: "Course progress" }), null);
  assert.equal(container.querySelector("a[href*='/revisar']"), null);

  // Start button and syllabus variation links point under previewBasePath.
  const startLink = screen.getByRole("link", { name: "Start course" });
  assert.equal(startLink.getAttribute("href"), `${basePath}/v1`);

  const variationHrefs = [...container.querySelectorAll("section a")]
    .map((a) => a.getAttribute("href"));
  assert.deepEqual(variationHrefs, [`${basePath}/v1`, `${basePath}/v2`]);

  assert.equal(checkCourseAccessCalls, 0);
  assert.equal(recordEnrollmentCalls, 0);
});

test("CourseView without preview props records enrollment and uses public /courses links", async () => {
  fakeCourseData = { ...fakeCourseData, progress: {} };
  const { container } = render(<CourseView course={COURSE} />);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(container.querySelector("[data-admin-preview-banner]"), null);
  assert.equal(screen.getByRole("link", { name: "Start course" }).getAttribute("href"), "/courses/london-review/v1");
  assert.equal(checkCourseAccessCalls, 1);
  assert.equal(recordEnrollmentCalls, 1);
});
