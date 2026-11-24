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
      { level: null },
      { level: "expert" },
      { question: " " },
      { question: "x".repeat(1001) },
      { question: 1 },
      { history: null },
      { history: Array(7).fill({ role: "user", text: "Hi" }) },
      { history: [{ role: "system", text: "Hi" }] },
      { history: [{ role: "assistant", text: "x".repeat(4001) }] },
      { context: "é".repeat(8192) },
      { fen: 1 },
      { fen: "x".repeat(101) },
      { gameTitle: null },
      { gameTitle: "x".repeat(121) },
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
    const { messages } = JSON.parse(String(init?.body));
    assert.equal(messages.at(-1).content, "Qual é o plano?");
    assert.match(messages[0].content, /players rated 1600–2000/);
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

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

test("awaits the session save and submits only the new turn for each answer", async (t) => {
  const saved: unknown[] = [];
  const gate = Promise.withResolvers<void>();
  const saving = Promise.withResolvers<void>();
  const rpc = mock.fn(async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, "save_ask_master_conversation_turn");
    saved.push(args);
    saving.resolve();
    await gate.promise;
    return { error: null };
  });
  state.server = { auth: { getUser: auth }, rpc };
  mockFetch(t, () => new Response(delta("Peão") + delta(" central") + "data: [DONE]\n\n"));

  const body = { ...input, fen, gameTitle: "Game" };
  const response = await post(JSON.stringify(body));
  let closed = false;
  const reading = response.text().then((answer) => {
    closed = true;
    return answer;
  });
  await saving.promise;
  await new Promise(setImmediate);
  assert.equal(closed, false);
  gate.resolve();
  assert.equal(await reading, "Peão central");

  const followUp = await post(JSON.stringify({
    ...body,
    question: "E depois?",
    history: [{ role: "user", text: "Qual é o plano?" }, { role: "assistant", text: "Peão central" }],
  }));
  assert.equal(await followUp.text(), "Peão central");
  const { bookKey } = await import("@/src/chess/opening-book.ts");
  const args = {
    p_id: input.conversationId,
    p_position_key: bookKey(fen).toString(),
    p_fen: fen,
    p_game_title: "Game",
    p_question: "Qual é o plano?",
    p_answer: "Peão central",
    p_model: config.ASK_MASTER_MODEL,
  };
  assert.deepEqual(saved, [args, { ...args, p_question: "E depois?" }]);
});

test("skips saving without a valid FEN, on stream error, truncation, or cancellation", async (t) => {
  const rpc = mock.fn(async () => ({ error: null }));
  state.server = { auth: { getUser: auth }, rpc };
  let stream = delta("Answer") + "data: [DONE]\n\n";
  mockFetch(t, () => new Response(stream));

  for (const position of [undefined, "invalid"]) {
    assert.equal(await (await post(JSON.stringify({ ...input, fen: position }))).text(), "Answer");
  }

  const body = JSON.stringify({ ...input, fen });
  stream = delta("Partial") + 'data: {"error":{"message":"failed"}}\n\n';
  await assert.rejects((await post(body)).text(), /Upstream stream failed/);
  stream = delta("Partial");
  assert.equal(await (await post(body)).text(), "Partial");

  stream = delta("Answer") + "data: [DONE]\n\n";
  await (await post(body)).body!.cancel();
  assert.equal(rpc.mock.callCount(), 0);
});

test("logs a failed save and still returns the complete answer", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  state.server = { auth: { getUser: auth }, rpc: async () => ({ error: { code: "42501" } }) };
  mockFetch(t, () => new Response(delta("Answer") + "data: [DONE]\n\n"));
  assert.equal(await (await post(JSON.stringify({ ...input, fen }))).text(), "Answer");
  assert.equal(log.mock.callCount(), 1);
});

test("saves with the board FEN the widget sends inside context", async (t) => {
  const saved: Array<Record<string, unknown>> = [];
  const rpc = mock.fn(async (_name: string, args: Record<string, unknown>) => {
    saved.push(args);
    return { error: null };
  });
  state.server = { auth: { getUser: auth }, rpc };
  mockFetch(t, () => new Response(delta("Answer") + "data: [DONE]\n\n"));

  assert.equal(await (await post(JSON.stringify({ ...input, context: { fen, moves: [] } }))).text(), "Answer");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].p_fen, fen);
});

test("uses an explicit coaching level in the provider prompt", async (t) => {
  mockFetch(t, (_url, init) => {
    const { messages } = JSON.parse(String(init?.body));
    assert.match(messages[0].content, /players rated 2000\+/);
    const event = JSON.stringify({ choices: [{ delta: { content: "A central pawn." } }] });
    return new Response(`data: ${event}\n\ndata: [DONE]\n\n`);
  });
  const response = await post(JSON.stringify({ ...input, level: "2000+" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "A central pawn.");
});
