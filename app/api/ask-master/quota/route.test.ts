import assert from "node:assert/strict";
import test from "node:test";
import { askMasterLimits } from "@/src/lib/ask-master/quota";
import { mockSupabaseModules, type FakeSupabaseState } from "@/src/test-utils/route-test.ts";

const state: FakeSupabaseState = {};
mockSupabaseModules(state);
const { GET } = await import("./route.ts");

test("quota requires a verified user", async () => {
  state.server = { auth: { getUser: async () => ({ data: { user: null } }) } };
  const response = await GET();
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("quota queries the signed-in user's usage and returns remaining questions", async () => {
  const user = { id: "user-123" };
  const filters: [string, string][] = [];
  const query = {
    select(column: string) {
      assert.equal(column, "questions");
      return query;
    },
    eq(column: string, value: string) {
      filters.push([column, value]);
      return query;
    },
    async maybeSingle() {
      return { data: { questions: askMasterLimits().userLimit - 1 } };
    },
  };
  state.server = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      assert.equal(table, "ask_master_usage");
      return query;
    },
  };
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { questionsLeft: 1 });
  assert.deepEqual(filters, [["user_id", user.id], ["day", new Date().toISOString().slice(0, 10)]]);
});
