import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/supabase/database.types";
import { canAuthorCourses, getRole, isAdmin, isCoach } from "./roles.ts";
import type { Role } from "./roles.ts";

function createMockSupabase(profileRole: unknown, onQuery?: () => void) {
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
                if (profileRole instanceof Error) {
                  return { data: null, error: profileRole };
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

describe("getRole", () => {
  it("returns admin for allowlisted confirmed email without querying", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });
    const result = await getRole(client, user({ email: "admin@example.com" }));
    assert.equal(result, "admin");
    assert.equal(queried, false);
  });

  it("queries the database for allowlisted email when unconfirmed", async () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    let queried = false;
    const client = createMockSupabase("student", () => {
      queried = true;
    });
    const result = await getRole(
      client,
      user({ email: "admin@example.com", email_confirmed_at: null }),
    );
    assert.equal(result, "student");
    assert.equal(queried, true);
  });

  it("returns the profile role for admin, coach and student", async () => {
    process.env.COURSE_ADMINS = "";
    for (const role of ["admin", "coach", "student"] as const) {
      const client = createMockSupabase(role);
      assert.equal(await getRole(client, user()), role);
    }
  });

  it("returns null on missing row, error, or unexpected value", async () => {
    process.env.COURSE_ADMINS = "";
    assert.equal(await getRole(createMockSupabase(null), user()), null);
    assert.equal(await getRole(createMockSupabase(new Error("boom")), user()), null);
    assert.equal(await getRole(createMockSupabase("superadmin"), user()), null);
  });
});

describe("role predicates", () => {
  it("isAdmin only matches admin", () => {
    assert.equal(isAdmin("admin"), true);
    assert.equal(isAdmin("coach"), false);
    assert.equal(isAdmin("student"), false);
    assert.equal(isAdmin(null), false);
    assert.equal(isAdmin(undefined), false);
  });

  it("isCoach only matches coach", () => {
    assert.equal(isCoach("coach"), true);
    assert.equal(isCoach("admin"), false);
    assert.equal(isCoach("student"), false);
    assert.equal(isCoach(null), false);
    assert.equal(isCoach(undefined), false);
  });

  it("canAuthorCourses matches admin and coach", () => {
    const allowed: Role[] = ["admin", "coach"];
    for (const role of allowed) {
      assert.equal(canAuthorCourses(role), true);
    }
    assert.equal(canAuthorCourses("student"), false);
    assert.equal(canAuthorCourses(null), false);
    assert.equal(canAuthorCourses(undefined), false);
  });
});
