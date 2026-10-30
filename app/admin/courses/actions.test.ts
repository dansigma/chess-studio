// Tests for the SIG-1115 review-queue read actions: admin-only list/count
// and per-id preview reads. Same fake-client grain as
// src/courses/publish.test.ts — server + service boundaries mocked once via
// holder objects, mutated per test.
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createFakeSupabase, type FakeTableConfig } from "@/src/test-utils/route-test.ts";

const serverState: { server?: unknown } = {};
const serviceState: { service?: unknown } = {};
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

const { getReviewCourseAction, listReviewQueueAction, reviewQueueCountAction } = await import("./actions.ts");

const ADMIN = { id: "admin-1", email: "boss@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const COACH = { id: "coach-1", email: "coach@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

const QUEUE_ID = "11111111-1111-4111-8111-111111111111";

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: QUEUE_ID,
    title: "London System",
    author_display_name: "Coach Ana",
    access_tier: "free",
    price_cents: null,
    updated_at: "2026-10-20T00:00:00.000Z",
    ...overrides,
  };
}

function wire(user: typeof ADMIN | typeof COACH | null, role: unknown, serviceTables: Record<string, FakeTableConfig> = {}) {
  const server = createFakeSupabase({
    tables: { profiles: { maybeSingle: role === null ? null : { role } } },
    auth: { getUser: async () => ({ data: { user }, error: null }) },
  });
  const service = createFakeSupabase({ tables: serviceTables });
  serverState.server = server;
  serviceState.service = service;
  return { server, service };
}

test("admin lists only in_review rows oldest first", async () => {
  wire(ADMIN, "admin", {
    courses: {
      selectRows: [queueRow({ id: "22222222-2222-4222-8222-222222222222", title: "B" }), queueRow({ title: "A" })],
    },
  });
  const result = await listReviewQueueAction();
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.rows.length, 2);
  assert.equal(result.ok && result.data.rows[0]?.title, "B");
});

test("coach and anonymous callers never receive the queue", async () => {
  wire(COACH, "coach", { courses: { selectRows: [queueRow()] } });
  assert.deepEqual(await listReviewQueueAction(), { ok: false, code: "forbidden" });
  assert.deepEqual(await reviewQueueCountAction(), { ok: false, code: "forbidden" });
  assert.deepEqual(await getReviewCourseAction(QUEUE_ID), { ok: false, code: "forbidden" });
  wire(null, null, { courses: { selectRows: [queueRow()] } });
  assert.deepEqual(await listReviewQueueAction(), { ok: false, code: "forbidden" });
});

test("queue drops rows with invalid tier/price instead of crashing", async () => {
  wire(ADMIN, "admin", {
    courses: {
      selectRows: [queueRow(), queueRow({ id: "33333333-3333-4333-8333-333333333333", access_tier: "paid", price_cents: null })],
    },
  });
  const result = await listReviewQueueAction();
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.rows.length, 1);
});

test("admin counts queued submissions, students see nothing", async () => {
  wire(ADMIN, "admin", { courses: { selectRows: [queueRow(), queueRow()] } });
  assert.deepEqual(await reviewQueueCountAction(), { ok: true, data: { count: 2 } });
  wire(COACH, "coach", { courses: { selectRows: [queueRow()] } });
  assert.deepEqual(await reviewQueueCountAction(), { ok: false, code: "forbidden" });
});

test("preview refuses non-admins and invalid ids", async () => {
  wire(COACH, "coach", { courses: { maybeSingle: queueRow() } });
  assert.deepEqual(await getReviewCourseAction(QUEUE_ID), { ok: false, code: "forbidden" });
  wire(ADMIN, "admin", { courses: { maybeSingle: queueRow() } });
  assert.deepEqual(await getReviewCourseAction("not-a-uuid"), { ok: false, code: "invalid_id" });
});

test("preview returns the full row for admins", async () => {
  const row = {
    ...queueRow(),
    slug: "london-system",
    summary: "Solid.",
    color: "white",
    theme: "openings",
    chapters: [],
    cover_url: null,
    video_url: null,
    published_at: null,
    status: "in_review",
  };
  wire(ADMIN, "admin", { courses: { maybeSingle: row } });
  const result = await getReviewCourseAction(QUEUE_ID);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.row.id, QUEUE_ID);
});
