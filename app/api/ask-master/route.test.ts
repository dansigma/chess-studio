import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import { mockFetch, mockSupabaseModules, setCloudflareEnv, type FakeSupabaseState } from "@/src/test-utils/route-test.ts";

const state: FakeSupabaseState = {};
mockSupabaseModules(state);
const { POST } = await import("./route.ts");

const config = {
  ASK_MASTER_BASE_URL: "https://provider.test/v1",
  ASK_MASTER_API_KEY: "secret",
  ASK_MASTER_MODEL: "model",
};
const input = {
  conversationId: "be637361-9949-46af-a7ee-05aa6914da73",
  question: "  Qual é o plano?  ",
  locale: "pt-br",
};
type QuotaRow = { allowed: boolean; reason: string | null; remaining: number };
const quotaRpc = mock.fn<(name: string, args: Record<string, unknown>) => {
  single: () => Promise<{ data: QuotaRow }>;
}>();
const auth = mock.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const limit = mock.fn<(input: { key: string }) => Promise<{ success: boolean }>>();
let userId: string;

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, ...config, ASK_MASTER_USER_DAILY_LIMIT: "4", ASK_MASTER_SITE_DAILY_LIMIT: "50" };
  userId = crypto.randomUUID();
  auth.mock.resetCalls();
  auth.mock.mockImplementation(async () => ({ data: { user: { id: userId } } }));
  quotaRpc.mock.resetCalls();
  quotaRpc.mock.mockImplementation(() => ({
    single: async () => ({ data: { allowed: true, reason: null, remaining: 3 } }),
  }));
  limit.mock.resetCalls();
  limit.mock.mockImplementation(async () => ({ success: true }));
  state.server = { auth: { getUser: auth } };
  state.service = { rpc: quotaRpc };
  setCloudflareEnv({ RL_AUTH: { limit } });
});

afterEach(() => {
  process.env = originalEnv;
  setCloudflareEnv({});
});

function post(body = JSON.stringify(input)) {
  return POST(new Request("https://app.test/api/ask-master", { method: "POST", body }));
}

for (const key of Object.keys(config)) {
  test(`returns 503 before validation when ${key} is missing`, async () => {
    delete process.env[key];
    const response = await post("!");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "unavailable" });
    assert.equal(auth.mock.callCount(), 0);
  });
}

test("rejects invalid request bodies before auth", async () => {
  for (const body of [
    "!",
    "null",
    ...[
      { conversationId: "invalid" },
      { conversationId: input.conversationId + "\n" },
      { locale: "es" },
      { question: " " },
      { question: "x".repeat(1001) },
      { question: 1 },
      { history: null },
      { history: Array(7).fill({ role: "user", text: "Hi" }) },
      { history: [{ role: "system", text: "Hi" }] },
      { history: [{ role: "assistant", text: "x".repeat(4001) }] },
      { context: "é".repeat(8192) },
    ].map((override) => JSON.stringify({ ...input, ...override })),
  ]) {
    assert.equal((await post(body)).status, 400, body.slice(0, 100));
  }
  assert.equal(auth.mock.callCount(), 0);
});

test("rejects visitors before the limiter or quota", async () => {
  auth.mock.mockImplementation(async () => ({ data: { user: null } }));
  assert.equal((await post()).status, 401);
  assert.equal(limit.mock.callCount(), 0);
  assert.equal(quotaRpc.mock.callCount(), 0);
});

test("returns 429 for the per-user burst limit before consuming quota", async () => {
  limit.mock.mockImplementation(async () => ({ success: false }));
  const response = await post();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.deepEqual(limit.mock.calls[0].arguments, [{ key: `ask-master:${userId}` }]);
  assert.equal(quotaRpc.mock.callCount(), 0);
});

for (const reason of ["user_limit", "site_limit", "error"]) {
  test(`stops before the provider on quota result ${reason}`, async (t) => {
    let calls = 0;
    mockFetch(t, () => {
      calls++;
      return null;
    });
    quotaRpc.mock.mockImplementation(() => ({
      single: async () => ({ data: { allowed: false, reason, remaining: 0 } }),
    }));
    const response = await post();
    assert.equal(calls, 0);
    if (reason === "error") {
      assert.equal(response.status, 503);
    } else {
      assert.equal(response.status, 429);
      assert.deepEqual(await response.json(), { error: "quota", reason });
    }
  });
}

test("returns 503 when upstream rejects the request", async (t) => {
  mockFetch(t, () => new Response("private upstream error", { status: 500 }));
  const response = await post();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "upstream" });
});

test("returns 503 when fetching upstream fails", async (t) => {
  mockFetch(t, () => { throw new TypeError("fetch failed"); });
  const response = await post();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "upstream" });
});

test("consumes quota for the verified user and streams split SSE deltas", async (t) => {
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`;
  mockFetch(t, (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).messages.at(-1).content, "Qual é o plano?");
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        upstream = controller;
        const first = encoder.encode(": ping\r\n\r\n" + event("Peão"));
        const split = first.indexOf(0xc3) + 1;
        controller.enqueue(first.slice(0, split));
        controller.enqueue(first.slice(split));
      },
    }));
  });
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.deepEqual(quotaRpc.mock.calls[0].arguments, ["consume_ask_master_question", {
    p_user_id: userId, p_user_limit: 4, p_site_limit: 50,
  }]);

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  assert.equal(decoder.decode((await reader.read()).value), "Peão");
  upstream.enqueue(encoder.encode(event(" central") + "data: [DONE]\n\n" + event("ignored")));
  assert.equal(decoder.decode((await reader.read()).value), " central");
  assert.equal((await reader.read()).done, true);
});
