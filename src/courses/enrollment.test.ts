import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkCourseAccess,
  recordCompletion,
  recordEnrollment,
  resetEnrollmentSession,
  shouldRecordCompletion,
  type EnrollmentClient,
} from "./enrollment.ts";

type InsertRow = { user_id: string; course_id: string };

type AccessClient = {
  rpc: (name: string, args: object) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function makeAccessClient(data: unknown, error: { message?: string } | null = null): {
  client: AccessClient;
  calls: { name: string; args: object }[];
} {
  const calls: { name: string; args: object }[] = [];
  return {
    calls,
    client: {
      rpc: (name: string, args: object) => {
        calls.push({ name, args });
        return Promise.resolve({ data, error });
      },
    },
  };
}

function makeClient(options?: {
  insertError?: { code?: string } | null;
  updateError?: { message?: string } | null;
}): { client: EnrollmentClient; calls: { inserts: InsertRow[]; updates: unknown[] } } {
  const calls: { inserts: InsertRow[]; updates: unknown[] } = { inserts: [], updates: [] };
  const client: EnrollmentClient = {
    from: () => ({
      insert: (row: InsertRow) => {
        calls.inserts.push(row);
        return Promise.resolve({ error: options?.insertError ?? null });
      },
      update: (row: { completed_at: string }) => ({
        eq: () => ({
          eq: () => ({
            is: () => {
              calls.updates.push(row);
              return Promise.resolve({ error: options?.updateError ?? null });
            },
          }),
        }),
      }),
    }),
  };
  return { client, calls };
}

describe("shouldRecordCompletion", () => {
  it("fires at 100 percent when not yet completed", () => {
    assert.equal(shouldRecordCompletion(100, false), true);
  });

  it("stays silent below 100 percent", () => {
    assert.equal(shouldRecordCompletion(99, false), false);
    assert.equal(shouldRecordCompletion(0, false), false);
  });

  it("never fires twice once completed", () => {
    assert.equal(shouldRecordCompletion(100, true), false);
  });
});

describe("recordEnrollment", () => {
  it("makes no client call for anonymous visitors", async () => {
    resetEnrollmentSession();
    const { client, calls } = makeClient();
    await recordEnrollment(client, null, "course-1");
    assert.deepEqual(calls.inserts, []);
  });

  it("inserts once per session for the same user and course", async () => {
    resetEnrollmentSession();
    const { client, calls } = makeClient();
    await recordEnrollment(client, "user-1", "course-1");
    await recordEnrollment(client, "user-1", "course-1");
    assert.deepEqual(calls.inserts, [{ user_id: "user-1", course_id: "course-1" }]);
  });

  it("treats a duplicate-key error as success and stays session-marked", async () => {
    resetEnrollmentSession();
    const { client, calls } = makeClient({ insertError: { code: "23505" } });
    await recordEnrollment(client, "user-1", "course-1");
    await recordEnrollment(client, "user-1", "course-1");
    assert.equal(calls.inserts.length, 1);
  });

  it("warns with the enrollment prefix and never throws on other errors", async () => {
    resetEnrollmentSession();
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      const { client } = makeClient({ insertError: { code: "42501" } });
      await recordEnrollment(client, "user-1", "course-1");
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /\[enrollment\]/);
  });
});

describe("checkCourseAccess", () => {
  it("returns true when the gate allows access", async () => {
    const { client, calls } = makeAccessClient(true);
    assert.equal(await checkCourseAccess(client, "course-1"), true);
    assert.deepEqual(calls, [{ name: "can_access_course", args: { p_course_id: "course-1" } }]);
  });

  it("returns false when the gate denies access", async () => {
    const { client } = makeAccessClient(false);
    assert.equal(await checkCourseAccess(client, "course-1"), false);
  });

  it("fails closed and warns without throwing on RPC error", async () => {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      const { client } = makeAccessClient(null, { message: "boom" });
      assert.equal(await checkCourseAccess(client, "course-1"), false);
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /\[enrollment\]/);
  });
});

describe("recordCompletion", () => {
  it("makes no client call for anonymous visitors", async () => {
    const { client, calls } = makeClient();
    await recordCompletion(client, null, "course-1");
    assert.deepEqual(calls.updates, []);
  });

  it("updates with the set-once guard and warns without throwing on error", async () => {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      const { client, calls } = makeClient({ updateError: { message: "boom" } });
      await recordCompletion(client, "user-1", "course-1");
      assert.equal(calls.updates.length, 1);
      assert.ok(typeof (calls.updates[0] as { completed_at: string }).completed_at === "string");
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /\[enrollment\]/);
  });
});
