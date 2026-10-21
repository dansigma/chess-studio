import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { isCourseSuperAdmin, userCanPublishCourses } from "./course-permissions.ts";

function createMockSupabase(profileRole: "admin" | "coach" | "student" | null, onQuery?: () => void) {
  return {
    from: (table: string) => {
      assert.equal(table, "profiles");
      return {
        select: (columns: string) => {
          assert.equal(columns, "role");
          return {
            eq: () => ({
              maybeSingle: async () => {
                onQuery?.();
                if (profileRole === null) {
                  return { data: null, error: null };
                }
                return { data: { role: profileRole }, error: null };
              },
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

function user(overrides: { id?: string; email?: string; email_confirmed_at?: string | null } = {}) {
  return {
    id: overrides.id ?? "u1",
    email: overrides.email ?? "user@example.com",
    email_confirmed_at:
      "email_confirmed_at" in overrides ? overrides.email_confirmed_at : "2026-10-14T00:00:00Z",
  };
}

describe("isCourseSuperAdmin", () => {
  it("returns true when the email is listed in COURSE_ADMINS and email is confirmed", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });
    assert.equal(
      await isCourseSuperAdmin(client, {
        id: "admin-1",
        email: "admin@example.com",
        email_confirmed_at: "2026-10-14T00:00:00Z",
      }),
      true,
    );
    assert.equal(queried, false);
  });

  it("returns false when the email is listed in COURSE_ADMINS but email is not confirmed", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    const client = createMockSupabase("student");
    assert.equal(
      await isCourseSuperAdmin(client, {
        id: "admin-2",
        email: "admin@example.com",
        email_confirmed_at: null,
      }),
      false,
    );
    assert.equal(
      await isCourseSuperAdmin(client, {
        id: "admin-3",
        email: "admin@example.com",
      }),
      false,
    );
  });

  it("ignores a stale app_metadata admin claim when profiles.role is student", async () => {
    process.env.COURSE_ADMINS = "";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });
    assert.equal(
      await isCourseSuperAdmin(
        client,
        // Stale session claim: must not short-circuit; the DB read decides.
        { ...user(), app_metadata: { role: "admin" } } as never,
      ),
      false,
    );
    assert.equal(queried, true);
  });

  it("returns true for an admin profile without allowlisting", async () => {
    process.env.COURSE_ADMINS = "";
    assert.equal(await isCourseSuperAdmin(createMockSupabase("admin"), user()), true);
  });

  it("returns false when the profile is missing", async () => {
    process.env.COURSE_ADMINS = "";
    assert.equal(await isCourseSuperAdmin(createMockSupabase(null), user()), false);
  });
});

describe("userCanPublishCourses", () => {
  it("refuses a stale app_metadata admin claim when profiles.role is student", async () => {
    process.env.COURSE_ADMINS = "";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(
      client,
      { ...user({ id: "u1" }), app_metadata: { role: "admin" } } as never,
    );

    assert.equal(result, false);
    assert.equal(queried, true);
  });

  it("returns true for allowlisted email with confirmed email without querying profiles", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(client, user({ id: "u2", email: "admin@example.com" }));

    assert.equal(result, true);
    assert.equal(queried, false);
  });

  it("returns false for allowlisted email with unconfirmed email if profile is student", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(
      client,
      user({ id: "u3", email: "admin@example.com", email_confirmed_at: null }),
    );

    assert.equal(result, false);
    assert.equal(queried, true);
  });

  it("returns true for allowlisted email with unconfirmed email if profile is admin", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("admin", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(
      client,
      user({ id: "u4", email: "admin@example.com", email_confirmed_at: null }),
    );

    assert.equal(result, true);
    assert.equal(queried, true);
  });

  it("returns false for non-allowlisted email with student profile", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    const client = createMockSupabase("student");

    const result = await userCanPublishCourses(client, user({ id: "u5", email: "student@example.com" }));

    assert.equal(result, false);
  });

  it("returns false for a coach profile", async () => {
    process.env.COURSE_ADMINS = "";
    const client = createMockSupabase("coach");

    assert.equal(await userCanPublishCourses(client, user({ id: "u6" })), false);
  });

  it("returns true for an admin profile without allowlisting", async () => {
    process.env.COURSE_ADMINS = "";
    const client = createMockSupabase("admin");

    assert.equal(await userCanPublishCourses(client, user({ id: "u7" })), true);
  });
});
