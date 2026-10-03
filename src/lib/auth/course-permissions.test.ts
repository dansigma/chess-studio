import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCourseSuperAdmin } from "./course-permissions.ts";

describe("isCourseSuperAdmin", () => {
  it("returns true when the email is listed in COURSE_ADMINS", () => {
    process.env.COURSE_ADMINS = "admin@example.com";
    assert.equal(
      isCourseSuperAdmin({ email: "admin@example.com", app_metadata: {} }),
      true,
    );
  });

  it("returns true for app_metadata role admin even when the email is not listed", () => {
    process.env.COURSE_ADMINS = "";
    assert.equal(
      isCourseSuperAdmin({
        email: "other@example.com",
        app_metadata: { role: "admin" },
      }),
      true,
    );
  });

  it("returns false when neither claim is present", () => {
    process.env.COURSE_ADMINS = "";
    assert.equal(
      isCourseSuperAdmin({ email: "other@example.com", app_metadata: {} }),
      false,
    );
  });
});
