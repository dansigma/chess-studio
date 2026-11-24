import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import { mockSupabaseModules, setCloudflareEnv, type FakeSupabaseState } from "@/src/test-utils/route-test.ts";

const state: FakeSupabaseState = {};
mockSupabaseModules(state);
const { POST, GET, DELETE } = await import("./route.ts");
const url = "https://app.test/api/ask-master/conversations";
const id = "be637361-9949-46af-a7ee-05aa6914da73";
const userId = "bbd5c93a-16a2-4347-ad3f-26be758f6df9";
const updatedAt = "2026-11-24T00:00:00Z";
const row = {
  id, user_id: userId, updated_at: updatedAt, game_title: "Game", position_key: "42", model: "model",
  messages: [{ role: "user", text: "Question" }, { role: "assistant", text: "Answer" }],
};
let rows: (typeof row)[];
let limit: ReturnType<typeof mock.fn<() => Promise<{ success: boolean }>>>;
let calls: unknown[][];

beforeEach(() => {
  rows = [row, { ...row, user_id: crypto.randomUUID(), position_key: "1" }];
  calls = [];
  limit = mock.fn(async () => ({ success: true }));
  setCloudflareEnv({ RL_60_MIN: { limit } });
  state.server = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from(table: string) {
      assert.equal(table, "ask_master_conversations");
      let filtered = rows;
      let deleting = false;
      const query = {
        select(columns: string) {
          calls.push(["select", columns]);
          if (!deleting) return query;
          rows = rows.filter((candidate) => !filtered.includes(candidate));
          return { data: filtered.map(({ id }) => ({ id })) };
        },
        delete() {
          deleting = true;
          return query;
        },
        eq(column: "user_id" | "id", value: string) {
          calls.push(["eq", column, value]);
          filtered = filtered.filter((candidate) => candidate[column] === value);
          return query;
        },
        in(column: "position_key", values: string[]) {
          calls.push(["in", column, values]);
          filtered = filtered.filter((candidate) => values.includes(candidate[column]));
          return query;
        },
        order(column: string, options: unknown) {
          calls.push(["order", column, options]);
          return query;
        },
        maybeSingle() {
          return { data: filtered[0] ?? null };
        },
        limit(count: number) {
          calls.push(["limit", count]);
          return { data: filtered.slice(0, count) };
        },
      };
      return query;
    },
  };
});

afterEach(() => setCloudflareEnv({}));

function list(positionKeys: unknown) {
  return POST(new Request(url, { method: "POST", body: JSON.stringify({ positionKeys }) }));
}

function get(value: string) {
  return GET(new Request(`${url}?id=${encodeURIComponent(value)}`));
}

function remove(value: string) {
  return DELETE(new Request(`${url}?id=${encodeURIComponent(value)}`, { method: "DELETE" }));
}

test("lists the user's matching conversations with the newest-first limit", async () => {
  const response = await list(["42", "1", "42"]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { conversations: [{
    id, updatedAt, gameTitle: "Game", firstQuestion: "Question", messageCount: 2, model: "model", positionKey: "42",
  }] });
  assert.deepEqual(calls.slice(1), [
    ["eq", "user_id", userId], ["in", "position_key", ["42", "1"]],
    ["order", "updated_at", { ascending: false }], ["limit", 100],
  ]);
});

test("validates the key list and delete UUID", async () => {
  for (const keys of [null, [], "42", [42], ["42\n"], ["abc"], ["1".repeat(21)], Array(301).fill("42")]) {
    assert.equal((await list(keys)).status, 400);
  }
  assert.equal((await remove(id + "\n")).status, 400);
  assert.equal((await get(id + "\n")).status, 400);
  assert.deepEqual(calls, []);
  assert.equal((await list(Array(300).fill("18446744073709551615"))).status, 200);
});

test("deletes an owned row and reports missing or unowned rows as 404", async () => {
  assert.equal((await remove(id)).status, 204);
  assert.deepEqual(calls, [["eq", "user_id", userId], ["eq", "id", id], ["select", "id"]]);
  assert.equal(rows.length, 1);
  assert.equal((await remove(id)).status, 404);
  assert.equal((await remove(crypto.randomUUID())).status, 404);
});

test("loads only an owned conversation and returns its transcript and metadata", async () => {
  const response = await get(id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { id, messages: row.messages, positionKey: "42", gameTitle: "Game" });
  assert.deepEqual(calls, [
    ["select", "id, messages, position_key, game_title"], ["eq", "user_id", userId], ["eq", "id", id],
  ]);
  assert.equal((await get(crypto.randomUUID())).status, 404);
  rows = rows.filter((candidate) => candidate.user_id !== userId);
  assert.equal((await get(id)).status, 404);
});

test("rejects signed-out list, load and delete requests", async () => {
  state.server = { auth: { getUser: async () => ({ data: { user: null } }) } };
  assert.equal((await list(["42"])).status, 401);
  assert.equal((await remove(id)).status, 401);
  assert.equal((await get(id)).status, 401);
  assert.equal(limit.mock.callCount(), 0);
});

test("shares the per-user rate limit across list and delete", async () => {
  limit.mock.mockImplementation(async () => ({ success: false }));
  for (const response of [await list(["42"]), await remove(id)]) {
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
  }
  assert.deepEqual(limit.mock.calls.map((call) => call.arguments), [
    [{ key: `ask-master-conversations:${userId}` }],
    [{ key: `ask-master-conversations:${userId}` }],
  ]);
});
