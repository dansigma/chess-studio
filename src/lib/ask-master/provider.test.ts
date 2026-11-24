import assert from "node:assert/strict";
import test from "node:test";
import { streamChat } from "./provider.ts";

test("sends a streaming chat request to the configured provider", async () => {
  const messages = [{ role: "user" as const, content: "What is the plan?" }];
  const conversationId = "be637361-9949-46af-a7ee-05aa6914da73";
  const fakeFetch: typeof fetch = async (url, init) => {
    assert.equal(url, "https://provider.test/v1/chat/completions");
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, {
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
      "User-Agent": "xadrez-digital-ask-master/1.0",
      "x-opencode-session": conversationId,
      "HTTP-Referer": "https://xadrez.digital",
      "X-Title": "Xadrez Digital",
    });
    assert.deepEqual(JSON.parse(String(init?.body)), { model: "configured-model", messages, stream: true });
    // Workers rejects "error"; anything but "follow"/"manual" fails every call at runtime.
    assert.equal(init?.redirect, "manual");
    return new Response('data: {"choices":[{"delta":{"content":"Control the center."}}]}\n\ndata: [DONE]\n\n');
  };
  const response = await streamChat(
    { baseUrl: "https://provider.test/v1/", apiKey: "secret", model: "configured-model" },
    { conversationId, messages, signal: new AbortController().signal },
    fakeFetch,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "Control the center.");
});

test("skips a malformed event line instead of failing the answer", async () => {
  const fakeFetch: typeof fetch = async () => new Response(
    'data: {"choices":[{"delta":{"content":"Develop "}}]}\n\ndata: {not json\n\ndata: {"choices":[{"delta":{"content":"pieces."}}]}\n\ndata: [DONE]\n\n',
  );
  const response = await streamChat(
    { baseUrl: "https://provider.test/v1", apiKey: "secret", model: "m" },
    { conversationId: "be637361-9949-46af-a7ee-05aa6914da73", messages: [], signal: new AbortController().signal },
    fakeFetch,
  );
  assert.equal(await response.text(), "Develop pieces.");
});

test("a reasoning model that thinks for more than 60 s before answering is not cut off", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const encoder = new TextEncoder();
  let push!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(controller) { push = controller; } });
  let aborted = false;
  const fakeFetch: typeof fetch = async (_url, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response(body);
  };
  const pending = streamChat(
    { baseUrl: "https://provider.test/v1", apiKey: "secret", model: "m" },
    { conversationId: "be637361-9949-46af-a7ee-05aa6914da73", messages: [], signal: new AbortController().signal },
    fakeFetch,
  );
  push.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}\n\n'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(61_000);
  push.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Play c5."}}]}\n\ndata: [DONE]\n\n'));
  push.close();
  const response = await pending;
  assert.equal(aborted, false);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "Play c5.");
});
