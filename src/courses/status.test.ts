import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTransition, type TransitionCheck } from "./status.ts";
import type { Role } from "@/src/lib/auth/roles.ts";
import type { CourseStatus } from "./types.ts";

const STATUSES: CourseStatus[] = ["draft", "in_review", "published", "rejected", "archived"];
const ROLES: Array<Role | null> = ["admin", "coach", "student", null];

function check(overrides: Partial<TransitionCheck> & { from: CourseStatus; to: CourseStatus }): TransitionCheck {
  return { role: "coach", isOwner: true, ...overrides };
}

describe("canTransition matrix", () => {
  it("matches the explicit allow-set for every role x owner x from x to", () => {
    const allowed = new Set<string>();
    for (const from of STATUSES) {
      // Admin: all 25, gated on note only for ->rejected (tested with hasNote below).
      for (const to of STATUSES) {
        if (to !== "rejected") allowed.add(`admin:true:${from}:${to}`);
      }
      // Coach + owner: save and submit only.
      if (from === "draft" || from === "rejected") {
        allowed.add(`coach:true:${from}:draft`);
        allowed.add(`coach:true:${from}:in_review`);
      }
    }
    for (const role of ROLES) {
      for (const isOwner of [true, false]) {
        for (const from of STATUSES) {
          for (const to of STATUSES) {
            const hasNote = to === "rejected" ? true : undefined;
            const result = canTransition({ role, isOwner, from, to, hasNote });
            const key = `${role}:${isOwner}:${from}:${to}`;
            if (allowed.has(key)) {
              assert.deepEqual(result, { ok: true }, key);
            } else if (role === "coach" || role === "student" || role === null) {
              if (!isOwner) {
                assert.deepEqual(result, { ok: false, reason: "not_owner" }, key);
              } else {
                assert.deepEqual(result, { ok: false, reason: "invalid_status_change" }, key);
              }
            } else {
              // Admin ->rejected without a note is covered below; here hasNote is set.
              assert.deepEqual(result, { ok: true }, key);
            }
          }
        }
      }
    }
  });

  it("lets a coach owner save and submit from draft and rejected", () => {
    for (const from of ["draft", "rejected"] as const) {
      assert.deepEqual(canTransition(check({ from, to: "draft" })), { ok: true });
      assert.deepEqual(canTransition(check({ from, to: "in_review" })), { ok: true });
    }
  });

  it("never lets a coach reach published", () => {
    for (const from of STATUSES) {
      assert.deepEqual(canTransition(check({ from, to: "published" })), {
        ok: false,
        reason: "invalid_status_change",
      });
    }
  });

  it("denies a coach non-owner everything with not_owner", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        assert.deepEqual(canTransition(check({ isOwner: false, from, to })), {
          ok: false,
          reason: "not_owner",
        });
      }
    }
  });

  it("denies students and signed-out callers everything", () => {
    for (const role of ["student", null, undefined] as const) {
      for (const isOwner of [true, false]) {
        assert.deepEqual(canTransition({ role, isOwner, from: "draft", to: "in_review" }), {
          ok: false,
          reason: isOwner ? "invalid_status_change" : "not_owner",
        });
      }
    }
  });

  it("lets an admin change anything and republish idempotently", () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        assert.deepEqual(
          canTransition({ role: "admin", isOwner: false, from, to, hasNote: to === "rejected" ? true : undefined }),
          { ok: true },
          `admin ${from}->${to}`,
        );
      }
    }
    // Admin owner and same-status republish are equally fine.
    assert.deepEqual(canTransition({ role: "admin", isOwner: true, from: "published", to: "published" }), { ok: true });
    assert.deepEqual(canTransition({ role: "admin", isOwner: false, from: "draft", to: "draft" }), { ok: true });
  });

  it("requires a note for admin rejects", () => {
    assert.deepEqual(canTransition({ role: "admin", isOwner: false, from: "in_review", to: "rejected" }), {
      ok: false,
      reason: "note_required",
    });
    assert.deepEqual(
      canTransition({ role: "admin", isOwner: false, from: "in_review", to: "rejected", hasNote: false }),
      { ok: false, reason: "note_required" },
    );
    assert.deepEqual(
      canTransition({ role: "admin", isOwner: false, from: "in_review", to: "rejected", hasNote: true }),
      { ok: true },
    );
  });
});
