import assert from "node:assert/strict";
import { test } from "node:test";
import { askMasterLimits, consumeQuestion, questionsLeft } from "./quota";

const limits = { userLimit: 5, siteLimit: 100 };
const refused = { allowed: false, reason: "error", remaining: 0 };
const outcomes = [
  { allowed: true, reason: null, remaining: 4 },
  { allowed: false, reason: "user_limit", remaining: 0 },
  { allowed: false, reason: "site_limit", remaining: 3 },
  { allowed: false, reason: "unauthenticated", remaining: 0 },
];

function fakeConsumer(single: () => Promise<{ data: unknown; error: unknown }>) {
  return {
    rpc(name: string, args: unknown) {
      assert.equal(name, "consume_ask_master_question");
      assert.deepEqual(args, { p_user_limit: 5, p_site_limit: 100 });
      return { single };
    },
  } as unknown as Parameters<typeof consumeQuestion>[0];
}

for (const outcome of outcomes) {
  test(`consumeQuestion returns the database outcome (${outcome.reason ?? "allowed"})`, async () => {
    const client = fakeConsumer(async () => ({ data: outcome, error: null }));
    assert.deepEqual(await consumeQuestion(client, limits), outcome);
  });
}

test("consumeQuestion refuses database errors, missing results, and transport failures", async () => {
  const databaseError = fakeConsumer(async () => ({ data: outcomes[0], error: { message: "database error" } }));
  const missing = fakeConsumer(async () => ({ data: null, error: null }));
  const transportError = fakeConsumer(async () => { throw new Error("network error"); });
  for (const client of [databaseError, missing, transportError]) {
    assert.deepEqual(await consumeQuestion(client, limits), refused);
  }
});

test("questionsLeft reads today's own count, clamps to zero, and fails closed", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-24T00:01:00Z") });
  const filters: Array<[string, string]> = [];
  let data: { questions: number } | null = { questions: 2 };
  let error: { message: string } | null = null;
  const query = {
    select(columns: string) {
      assert.equal(columns, "questions");
      return query;
    },
    eq(column: string, value: string) {
      filters.push([column, value]);
      return query;
    },
    async maybeSingle() {
      return { data, error };
    },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "caller" } }, error: null }) },
    from(table: string) {
      assert.equal(table, "ask_master_usage");
      return query;
    },
  } as unknown as Parameters<typeof questionsLeft>[0];

  assert.equal(await questionsLeft(client, 5), 3);
  assert.deepEqual(filters, [["user_id", "caller"], ["day", "2026-11-24"]]);
  data = { questions: 7 };
  assert.equal(await questionsLeft(client, 5), 0);
  data = null;
  assert.equal(await questionsLeft(client, 5), 5);
  error = { message: "database error" };
  assert.equal(await questionsLeft(client, 5), 0);
});

test("askMasterLimits uses defaults for missing and invalid values", () => {
  assert.deepEqual(askMasterLimits({}), limits);
  for (const value of ["", "0", "-1", "1.5", "1e2", "Infinity", "10 questions", "2147483648"]) {
    assert.deepEqual(askMasterLimits({
      ASK_MASTER_USER_DAILY_LIMIT: value,
      ASK_MASTER_SITE_DAILY_LIMIT: value,
    }), limits);
  }
  assert.deepEqual(askMasterLimits({
    ASK_MASTER_USER_DAILY_LIMIT: " 7 ",
    ASK_MASTER_SITE_DAILY_LIMIT: "250",
  }), { userLimit: 7, siteLimit: 250 });
});
