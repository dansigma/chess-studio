import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminDenyDestination } from "./admin-gate.ts";

describe("sig-889 adminDenyDestination", () => {
  it("denies /courses/admin to /courses when Supabase is unconfigured", () => {
    assert.equal(
      adminDenyDestination("/courses/admin", { configured: false, hasUser: false, canPublish: false }),
      "/courses",
    );
    assert.equal(
      adminDenyDestination("/courses/admin/drafts", { configured: false, hasUser: false, canPublish: false }),
      "/courses",
    );
  });

  it("sends anonymous configured users to login with next", () => {
    assert.equal(
      adminDenyDestination("/courses/admin", { configured: true, hasUser: false, canPublish: false }),
      "/login?next=%2Fcourses%2Fadmin",
    );
  });

  it("denies configured non-publishers to /courses", () => {
    assert.equal(
      adminDenyDestination("/courses/admin", { configured: true, hasUser: true, canPublish: false }),
      "/courses",
    );
  });

  it("allows publishers and leaves non-admin paths alone", () => {
    assert.equal(adminDenyDestination("/courses/admin", { configured: true, hasUser: true, canPublish: true }), null);
    assert.equal(adminDenyDestination("/courses", { configured: false, hasUser: false, canPublish: false }), null);
    assert.equal(adminDenyDestination("/courses/french", { configured: true, hasUser: false, canPublish: false }), null);
  });
});
