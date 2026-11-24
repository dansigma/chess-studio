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
