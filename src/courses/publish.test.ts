// Tests for the SIG-1113 course review workflow: coach draft save and
// submit, admin approve/reject/unpublish/archive, the uniform canTransition
// gate on every status-changing write, and the visibility-rule revalidation
// (revalidate on crossing the published boundary, never on a plain save).
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  createFakeSupabase,
  nextTestIp,
  setRequestHeaders,
} from "@/src/test-utils/route-test.ts";
import { resetRevalidateCalls, revalidateCalls } from "@/src/test-utils/stubs/next-cache.ts";
import type { Course } from "./types.ts";

const serverState: { server?: unknown } = {};
const serviceState: { service?: unknown } = {};
// NOTE: same single-mock pattern as app/admin/users/actions.test.ts — both
// boundaries are mocked once, manually, with per-test holders.
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

const {
  saveCourseDraft,
  submitCourseForReview,
  approveCourse,
  rejectCourse,
  archiveCourse,
  publishCourse,
  unpublishCourse,
  removePublishedCourse,
} = await import("./publish.ts");

const COACH = { id: "coach-1", email: "coach@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const OTHER_COACH = { id: "coach-2", email: "other@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const ADMIN = { id: "admin-1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const STUDENT = { id: "student-1", email: "kid@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

const COURSE_ID = "11111111-1111-1111-8111-111111111111";

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: COURSE_ID,
    slug: "london-system",
    title: "London System",
    summary: "A solid opening.",
    theme: "openings",
    color: "white",
    chapters: [{ id: "c1", title: "Basics", variations: [{ id: "v1", title: "Main", pgn: "1. d4 d5 2. Bf4" }] }],
    status: "draft",
    accessTier: "free",
    priceCents: null,
    ...overrides,
  };
}

function wire(user: typeof COACH | null, profileRole: unknown, tables: Record<string, unknown> = {}) {
  const server = createFakeSupabase({
    tables: { profiles: { maybeSingle: profileRole === null ? null : { role: profileRole } }, ...tables },
    auth: { getUser: async () => ({ data: { user }, error: null }) },
  });
  const service = createFakeSupabase({ tables: { profiles: {}, courses: { maybeSingle: null, selectRows: [] }, ...tables } });
  serverState.server = server;
  serviceState.service = service;
  setRequestHeaders(new Headers({ "x-forwarded-for": nextTestIp() }));
  resetRevalidateCalls();
  return { server, service };
}

/** Course row (or null) returned by the per-id read before every write. */
function withCourseRow(existing: Record<string, unknown> | null, user = COACH, role: unknown = "coach", extra: Record<string, unknown> = {}) {
  const row = existing
    ? { id: COURSE_ID, created_by: user.id, status: "draft", slug: "london-system", ...existing }
    : null;
  return wire(user, role, { courses: { maybeSingle: row, selectRows: row ? [{ id: row.id }] : [] }, ...extra });
}

test("coach saves a new draft without revalidating", async () => {
  const { service } = withCourseRow(null);
  const result = await saveCourseDraft(course());
  assert.deepEqual(result.ok, true);
  const upsert = service.calls.upsert.find((call) => call.table === "courses");
  assert.ok(upsert, "expected a courses upsert");
  assert.equal((upsert!.row as { status: string }).status, "draft");
  assert.equal(revalidateCalls.length, 0);
});

test("coach saves onto rejected (resubmit flow) without clearing the note", async () => {
  const { service } = withCourseRow({ status: "rejected" });
  const result = await saveCourseDraft(course());
  assert.deepEqual(result.ok, true);
  const upsert = service.calls.upsert.find((call) => call.table === "courses");
  assert.equal((upsert!.row as { status: string }).status, "draft");
  assert.ok(!("review_note" in (upsert!.row as Record<string, unknown>)), "save must clear nothing else");
  assert.equal(revalidateCalls.length, 0);
});

test("coach submits draft for review and cannot touch published", async () => {
  let wired = withCourseRow({ status: "draft" });
  assert.deepEqual(await submitCourseForReview(COURSE_ID), { ok: true });
  assert.deepEqual(
    wired.service.calls.update.map((call) => call.row),
    [{ status: "in_review", updated_at: (wired.service.calls.update[0]!.row as { updated_at: string }).updated_at }],
  );

  wired = withCourseRow({ status: "published" });
  assert.deepEqual(await submitCourseForReview(COURSE_ID), {
    ok: false,
    error: { key: "course.admin.error.invalid_status_change" },
  });
  assert.equal(wired.service.calls.update.length, 0);
});

test("coach cannot save or submit someone else's course", async () => {
  const { service } = withCourseRow({ created_by: OTHER_COACH.id }, OTHER_COACH);
  // Signed in as COACH, row owned by OTHER_COACH.
  serverState.server = createFakeSupabase({
    tables: { profiles: { maybeSingle: { role: "coach" } } },
    auth: { getUser: async () => ({ data: { user: COACH }, error: null }) },
  });
  assert.deepEqual(await submitCourseForReview(COURSE_ID), {
    ok: false,
    error: { key: "course.admin.error.not_owner" },
  });
  assert.deepEqual(await saveCourseDraft(course()), {
    ok: false,
    error: { key: "course.admin.error.not_owner" },
  });
  assert.equal(service.calls.update.length, 0);
});

test("coach never reaches published, however they try", async () => {
  withCourseRow({ status: "in_review" });
  assert.deepEqual(await publishCourse(course({ status: "in_review" })), {
    ok: false,
    error: { key: "course.admin.error.cannotPublish" },
  });
  assert.deepEqual(await approveCourse(COURSE_ID), {
    ok: false,
    error: { key: "course.admin.error.cannotPublish" },
  });
  assert.equal(revalidateCalls.length, 0);
});

test("student and signed-out callers are denied before any write", async () => {
  const { service } = withCourseRow({ status: "draft" }, STUDENT, "student");
  for (const call of [
    () => saveCourseDraft(course()),
    () => submitCourseForReview(COURSE_ID),
    () => approveCourse(COURSE_ID),
    () => rejectCourse(COURSE_ID, "Needs work, please revise."),
  ]) {
    const result = await call();
    assert.equal(result.ok, false);
  }
  wire(null, null, { courses: { maybeSingle: null, selectRows: [] } });
  assert.deepEqual(await submitCourseForReview(COURSE_ID), {
    ok: false,
    error: { key: "course.admin.error.signinRequired" },
  });
  assert.equal(service.calls.update.length, 0);
  assert.equal(service.calls.upsert.length, 0);
});

test("coach draft save rejects tier/price mismatches and persists valid paid", async () => {
  withCourseRow(null);
  assert.deepEqual(await saveCourseDraft(course({ accessTier: "free", priceCents: 1990 })), {
    ok: false,
    error: { key: "course.admin.error.invalidPrice" },
  });

  withCourseRow(null);
  assert.deepEqual(await saveCourseDraft(course({ accessTier: "paid", priceCents: null })), {
    ok: false,
    error: { key: "course.admin.error.invalidPrice" },
  });

  const { service } = withCourseRow(null);
  const paid = await saveCourseDraft(course({ accessTier: "paid", priceCents: 1990 }));
  assert.equal(paid.ok, true);
  const upsert = service.calls.upsert.find((call) => call.table === "courses");
  assert.equal((upsert!.row as { access_tier: string }).access_tier, "paid");
  assert.equal((upsert!.row as { price_cents: number }).price_cents, 1990);
});

test("admin publish rejects tier/price mismatches", async () => {
  withCourseRow(null, ADMIN, "admin");
  assert.deepEqual(await publishCourse(course({ accessTier: "paid", priceCents: null })), {
    ok: false,
    error: { key: "course.admin.error.invalidPrice" },
  });
});

test("admin approves in_review and revalidates the public pages", async () => {
  const { service } = withCourseRow({ status: "in_review" }, ADMIN, "admin");
  assert.deepEqual(await approveCourse(COURSE_ID), { ok: true });
  const update = service.calls.update.find((call) => call.table === "courses");
  assert.ok(update);
  assert.equal((update!.row as { status: string }).status, "published");
  assert.equal((update!.row as { review_note: unknown }).review_note, null);
  assert.deepEqual(
    revalidateCalls.map((call) => call.path).sort(),
    ["/courses", "/courses/london-system"],
  );
});

test("admin republish is idempotent and revalidates nothing", async () => {
  withCourseRow({ status: "published" }, ADMIN, "admin");
  assert.deepEqual(await approveCourse(COURSE_ID), { ok: true });
  assert.equal(revalidateCalls.length, 0);
});

test("admin rejects with a valid note and revalidates when demoting published", async () => {
  const firstWired = withCourseRow({ status: "in_review" }, ADMIN, "admin");
  assert.deepEqual(await rejectCourse(COURSE_ID, "  Needs more lines.  "), { ok: true });
  const first = firstWired.service.calls.update.find((call) => call.table === "courses");
  assert.equal((first!.row as { review_note: string }).review_note, "Needs more lines.");
  assert.equal(revalidateCalls.length, 0, "in_review was never public");

  withCourseRow({ status: "published" }, ADMIN, "admin");
  assert.deepEqual(await rejectCourse(COURSE_ID, "Outdated theory."), { ok: true });
  assert.deepEqual(
    revalidateCalls.map((call) => call.path).sort(),
    ["/courses", "/courses/london-system"],
  );
});

test("admin reject requires a 3–500 character note", async () => {
  const { service } = withCourseRow({ status: "in_review" }, ADMIN, "admin");
  for (const note of ["", "  ", "ab", "x".repeat(501)]) {
    assert.deepEqual(await rejectCourse(COURSE_ID, note), {
      ok: false,
      error: { key: "course.admin.error.note_required" },
    });
  }
  assert.equal(service.calls.update.length, 0);
});

// SIG-1174: a missing course is distinct from a note failure — the queue
// maps this key to its not-found message.
test("admin reject of a missing course returns publishFailed", async () => {
  const { service } = withCourseRow(null, ADMIN, "admin");
  assert.deepEqual(await rejectCourse(COURSE_ID, "Needs work, please revise."), {
    ok: false,
    error: { key: "course.admin.error.publishFailed" },
  });
  assert.equal(service.calls.update.length, 0);
});

test("admin unpublishes published back to draft with revalidation", async () => {
  const { service } = withCourseRow({ status: "published" }, ADMIN, "admin");
  assert.deepEqual(await unpublishCourse(COURSE_ID), { ok: true });
  const update = service.calls.update.find((call) => call.table === "courses");
  assert.equal((update!.row as { status: string }).status, "draft");
  assert.deepEqual(
    revalidateCalls.map((call) => call.path).sort(),
    ["/courses", "/courses/london-system"],
  );
});

test("admin removes a published course and revalidates its pages", async () => {
  const { service } = withCourseRow({ status: "published" }, ADMIN, "admin");
  assert.deepEqual(await removePublishedCourse(COURSE_ID), { ok: true });
  assert.ok(
    service.calls.deleted.some((call) => call.table === "courses"),
    "expected a courses delete",
  );
  assert.deepEqual(
    revalidateCalls.map((call) => call.path).sort(),
    ["/courses", "/courses/london-system"],
  );
});

test("admin removes a row without a slug and still revalidates the list", async () => {
  withCourseRow({ status: "draft", slug: null }, ADMIN, "admin");
  assert.deepEqual(await removePublishedCourse(COURSE_ID), { ok: true });
  assert.deepEqual(
    revalidateCalls.map((call) => call.path),
    ["/courses"],
  );
});

test("admin republish of edited published content revalidates, including slug changes", async () => {
  withCourseRow({ status: "published" }, ADMIN, "admin");
  const sameSlug = await publishCourse(course({ status: "published", title: "London System v2" }));
  assert.equal(sameSlug.ok, true);
  assert.deepEqual(
    revalidateCalls.map((call) => call.path).sort(),
    ["/courses", "/courses/london-system"],
  );

  withCourseRow({ status: "published" }, ADMIN, "admin");
  const renamed = await publishCourse(course({ status: "published", slug: "jobava-london" }));
  assert.equal(renamed.ok, true);
  assert.deepEqual(
    revalidateCalls.map((call) => call.path).sort(),
    ["/courses", "/courses/jobava-london", "/courses/london-system"],
  );
});

test("admin archives anything and always revalidates", async () => {
  const { service } = withCourseRow({ status: "in_review" }, ADMIN, "admin");
  assert.deepEqual(await archiveCourse(COURSE_ID), { ok: true });
  assert.equal((service.calls.update[0]!.row as { status: string }).status, "archived");
  assert.deepEqual(
    revalidateCalls.map((call) => call.path).sort(),
    ["/courses", "/courses/london-system"],
  );
});
