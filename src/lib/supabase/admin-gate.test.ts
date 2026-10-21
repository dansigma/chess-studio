import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminDenyDestination } from "./admin-gate.ts";

describe("sig-889 adminDenyDestination", () => {
  it("denies /courses/admin to /courses when Supabase is unconfigured", () => {
    assert.equal(
      adminDenyDestination("/courses/admin", { configured: false, hasUser: false, canAuthor: false }),
      "/courses",
    );
    assert.equal(
      adminDenyDestination("/courses/admin/drafts", { configured: false, hasUser: false, canAuthor: false }),
      "/courses",
    );
  });

  it("sends anonymous configured users to login with next", () => {
    assert.equal(
      adminDenyDestination("/courses/admin", { configured: true, hasUser: false, canAuthor: false }),
      "/login?next=%2Fcourses%2Fadmin",
    );
  });

  it("denies configured non-authors to /courses", () => {
    assert.equal(
      adminDenyDestination("/courses/admin", { configured: true, hasUser: true, canAuthor: false }),
      "/courses",
    );
  });

  it("allows authors (admin or coach) and leaves non-admin paths alone", () => {
    // A coach passes the gate (canAuthor true) while students do not.
    assert.equal(adminDenyDestination("/courses/admin", { configured: true, hasUser: true, canAuthor: true }), null);
    assert.equal(adminDenyDestination("/courses", { configured: false, hasUser: false, canAuthor: false }), null);
    assert.equal(adminDenyDestination("/courses/french", { configured: true, hasUser: false, canAuthor: false }), null);
  });
});
