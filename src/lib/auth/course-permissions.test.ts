import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { isCourseSuperAdmin, userCanPublishCourses } from "./course-permissions.ts";

function createMockSupabase(profileRole: "admin" | "student" | null, onQuery?: () => void) {
  return {
    from: (table: string) => {
      assert.equal(table, "profiles");
      return {
        select: (columns: string) => {
          assert.equal(columns, "role");
          return {
            eq: (_column: string, _value: string) => ({
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

describe("isCourseSuperAdmin", () => {
  it("returns true when the email is listed in COURSE_ADMINS and email is confirmed", () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    assert.equal(
      isCourseSuperAdmin({
        email: "admin@example.com",
        app_metadata: {},
        email_confirmed_at: "2026-10-14T00:00:00Z",
      }),
      true,
    );
  });

  it("returns false when the email is listed in COURSE_ADMINS but email is not confirmed", () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    assert.equal(
      isCourseSuperAdmin({
        email: "admin@example.com",
        app_metadata: {},
        email_confirmed_at: null,
      }),
      false,
    );
    assert.equal(
      isCourseSuperAdmin({
        email: "admin@example.com",
        app_metadata: {},
      }),
      false,
    );
  });

  it("returns true for app_metadata role admin even when email is unconfirmed or not listed", () => {
    process.env.COURSE_ADMINS = "";
    assert.equal(
      isCourseSuperAdmin({
        email: "other@example.com",
        app_metadata: { role: "admin" },
        email_confirmed_at: null,
      }),
      true,
    );
  });

  it("returns false when neither claim is present", () => {
    process.env.COURSE_ADMINS = "";
    assert.equal(
      isCourseSuperAdmin({
        email: "other@example.com",
        app_metadata: {},
        email_confirmed_at: "2026-10-14T00:00:00Z",
      }),
      false,
    );
  });
});

describe("userCanPublishCourses", () => {
  it("returns true for app_metadata role admin without querying profiles", async () => {
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(client, {
      id: "u1",
      email: "other@example.com",
      app_metadata: { role: "admin" },
      email_confirmed_at: null,
    });

    assert.equal(result, true);
    assert.equal(queried, false);
  });

  it("returns true for allowlisted email with confirmed email without querying profiles", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(client, {
      id: "u2",
      email: "admin@example.com",
      app_metadata: {},
      email_confirmed_at: "2026-10-14T00:00:00Z",
    });

    assert.equal(result, true);
    assert.equal(queried, false);
  });

  it("returns false for allowlisted email with unconfirmed email if profile is student", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(client, {
      id: "u3",
      email: "admin@example.com",
      app_metadata: {},
      email_confirmed_at: null,
    });

    assert.equal(result, false);
    assert.equal(queried, true);
  });

  it("returns true for allowlisted email with unconfirmed email if profile is admin", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("admin", () => {
      queried = true;
    });

    const result = await userCanPublishCourses(client, {
      id: "u4",
      email: "admin@example.com",
      app_metadata: {},
      email_confirmed_at: null,
    });

    assert.equal(result, true);
    assert.equal(queried, true);
  });

  it("returns false for non-allowlisted email with student profile", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    const client = createMockSupabase("student");

    const result = await userCanPublishCourses(client, {
      id: "u5",
      email: "student@example.com",
      app_metadata: {},
      email_confirmed_at: "2026-10-14T00:00:00Z",
    });

    assert.equal(result, false);
  });
});
