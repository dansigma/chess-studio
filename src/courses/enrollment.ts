// SIG-1052: per-user per-course enrollment (first open) and completion
// records. Progress keyed by variation_id has no course link in SQL, so this
// client-side hook writes the link explicitly: one row per (user, course)
// on first open, then a set-once completed_at when the course hits 100%.
//
// Both writers are failure-safe (warn with an [enrollment] prefix, never
// throw): a stats write must not break studying. Anonymous visitors are never
// counted — the caller passes null userId and no client call happens.

/** Minimal structural shape of the enrollments table client. */
type EnrollmentInsertResult = { error: { code?: string } | null };
type EnrollmentUpdateResult = { error: { message?: string } | null };

/** Structural client for the course_enrollments insert/update calls. */
export type EnrollmentClient = {
  from(table: string): {
    insert(row: object): Promise<EnrollmentInsertResult>;
    update(row: object): {
      eq(col: string, value: string): {
        eq(col: string, value: string): {
          is(col: string, value: null): Promise<EnrollmentUpdateResult>;
        };
      };
    };
  };
};

/**
 * Narrows an opaque client (the browser Supabase client, whose generated
 * types may lag behind new tables) to the enrollments shape. Mirrors the
 * store's untyped-table grain (store.ts attachEditableChapters,
 * use-course-content.ts): cast through unknown at the boundary, once.
 */
function asEnrollmentClient(supabase: unknown): EnrollmentClient {
  return supabase as EnrollmentClient;
}

/** Courses already recorded this browser session (user + course pair). */
const recordedThisSession = new Set<string>();

/** Clears the session guard. Used by tests only — a browser session is the scope. */
export function resetEnrollmentSession(): void {
  recordedThisSession.clear();
}

/** Pure rule: completion means every lesson learned, recorded exactly once. */
export function shouldRecordCompletion(percent: number, alreadyCompleted: boolean): boolean {
  return percent >= 100 && !alreadyCompleted;
}

/** Structural shape of the can_access_course RPC caller. */
export type AccessCheckClient = {
  rpc(name: string, args: object): Promise<{ data: unknown; error: { message?: string } | null }>;
};

function asAccessCheckClient(supabase: unknown): AccessCheckClient {
  return supabase as AccessCheckClient;
}

/**
 * SIG-1177: single source of truth for "can this user access this course" on
 * the client. Calls the existing public.can_access_course SQL function (the
 * same gate that guards course_content reads). Fails closed: any RPC error or
 * non-true result means no access. Failure-safe (warns with an [enrollment]
 * prefix, never throws): a stats write must not break studying, and must not
 * inflate coach counts on uncertainty.
 */
export async function checkCourseAccess(supabase: unknown, courseId: string): Promise<boolean> {
  const { data, error } = await asAccessCheckClient(supabase).rpc("can_access_course", { p_course_id: courseId });
  if (error) {
    console.warn("[enrollment] checkCourseAccess failed", error);
    return false;
  }
  return data === true;
}

/**
 * Records the first open of a course by a signed-in user. Fires at most once
 * per (user, course) per session; a duplicate-key error (code 23505) means
 * another tab or effect already wrote the row, so it counts as success.
 */
export async function recordEnrollment(
  supabase: unknown,
  userId: string | null,
  courseId: string,
): Promise<void> {
  if (!userId) {
    return;
  }
  const key = `${userId}:${courseId}`;
  if (recordedThisSession.has(key)) {
    return;
  }
  recordedThisSession.add(key);
  const { error } = await asEnrollmentClient(supabase).from("course_enrollments").insert({ user_id: userId, course_id: courseId });
  if (!error || error.code === "23505") {
    return;
  }
  console.warn("[enrollment] recordEnrollment failed", error);
}

/**
 * Sets completed_at once when a course reaches 100%. The IS NULL guard keeps
 * an existing timestamp (never clears it); concurrent completions converge.
 */
export async function recordCompletion(
  supabase: unknown,
  userId: string | null,
  courseId: string,
): Promise<void> {
  if (!userId) {
    return;
  }
  const { error } = await asEnrollmentClient(supabase)
    .from("course_enrollments")
    .update({ completed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .is("completed_at", null);
  if (!error) {
    return;
  }
  console.warn("[enrollment] recordCompletion failed", error);
}
