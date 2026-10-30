// SIG-1115: admin-gated review-queue reads. The page and preview routes call
// these after their own redirect guard; the actions re-check the admin role
// (fail-closed for anonymous, students, and coaches) and then read through
// the service client, because RLS only returns an admin their own drafts.
"use server";

import { getRole, isAdmin } from "@/src/lib/auth/roles";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { createServerSupabase } from "@/src/lib/supabase/server";
import type { PreviewCourseRow } from "@/src/courses/catalog";
import { isCourseAccessTier, isCourseId } from "@/src/courses/catalog";
// service-role: the queue and preview reads below go through the service
// client (createServiceSupabase) after the admin check, because RLS only
// returns an admin their own drafts.
import { validateTierAndPrice } from "@/src/courses/author-actions";
import type { CourseAccessTier } from "@/src/courses/types";

export type ReviewQueueCode = "invalid_id" | "unavailable" | "forbidden";

export type ReviewQueueActionResult<T> = { ok: true; data: T } | { ok: false; code: ReviewQueueCode };

export type ReviewQueueRowData = {
  id: string;
  title: string;
  authorName: string | null;
  tier: CourseAccessTier;
  priceCents: number | null;
  submittedAt: string;
};

type ServiceAdmin = NonNullable<ReturnType<typeof createServiceSupabase>>;

async function reviewGate(): Promise<{ ok: true; admin: ServiceAdmin } | { ok: false; code: "forbidden" | "unavailable" }> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, code: "forbidden" };
  }
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return { ok: false, code: "forbidden" };
  }
  if (!isAdmin(await getRole(supabase, user))) {
    return { ok: false, code: "forbidden" };
  }
  const admin = createServiceSupabase();
  if (!admin) {
    return { ok: false, code: "unavailable" };
  }
  return { ok: true, admin };
}

/** Queued `in_review` submissions, oldest update first, for the admin list. */
export async function listReviewQueueAction(): Promise<ReviewQueueActionResult<{ rows: ReviewQueueRowData[] }>> {
  const gate = await reviewGate();
  if (!gate.ok) {
    return gate;
  }
  const { data, error } = await gate.admin.from("courses").select("id, title, author_display_name, access_tier, price_cents, updated_at").eq("status", "in_review");
  if (error || !Array.isArray(data)) {
    return { ok: false, code: "unavailable" };
  }
  const rows: ReviewQueueRowData[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || !isCourseId(row.id)) {
      continue;
    }
    if (typeof row.title !== "string") {
      continue;
    }
    const tier: CourseAccessTier = typeof row.access_tier === "string" && isCourseAccessTier(row.access_tier) ? row.access_tier : "free";
    const priceCents = typeof row.price_cents === "number" ? row.price_cents : row.price_cents == null ? null : null;
    // Invalid tier/price combinations never reach the queue UI (same
    // invariant as the DB `courses_paid_price_check`, checked here because
    // the queue reads raw rows instead of toCourse).
    if (validateTierAndPrice(tier, priceCents).ok === false) {
      continue;
    }
    rows.push({
      id: row.id,
      title: row.title,
      authorName: typeof row.author_display_name === "string" ? row.author_display_name : null,
      tier,
      priceCents,
      submittedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    });
  }
  rows.sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : 0));
  return { ok: true, data: { rows } };
}

/** Count of queued submissions, for the CourseChrome badge (admins only). */
export async function reviewQueueCountAction(): Promise<ReviewQueueActionResult<{ count: number }>> {
  const gate = await reviewGate();
  if (!gate.ok) {
    return gate;
  }
  // Count read through the service client (createServiceSupabase in
  // reviewGate above; RLS hides other authors' drafts from sessions).
  const { data, error } = await gate.admin.from("courses").select("id").eq("status", "in_review");
  if (error || !Array.isArray(data)) {
    return { ok: false, code: "unavailable" };
  }
  return { ok: true, data: { count: data.length } };
}

/** Full row (including PGN chapters) for the admin preview route. */
export async function getReviewCourseAction(id: string): Promise<ReviewQueueActionResult<{ row: PreviewCourseRow }>> {
  if (!isCourseId(id)) {
    return { ok: false, code: "invalid_id" };
  }
  const gate = await reviewGate();
  if (!gate.ok) {
    return gate;
  }
  // Full-row read through the service client (createServiceSupabase in
  // reviewGate above) so the admin can preview another author's draft.
  const { data, error } = await gate.admin
    .from("courses")
    .select("id, slug, title, summary, color, theme, outline, chapters, cover_url, video_url, published_at, status, access_tier, price_cents, currency, author_display_name, review_note")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || typeof data !== "object") {
    return { ok: false, code: "unavailable" };
  }
  return { ok: true, data: { row: data as PreviewCourseRow } };
}
