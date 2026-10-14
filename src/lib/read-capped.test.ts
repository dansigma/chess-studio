import assert from "node:assert/strict";
import test from "node:test";
import { readCapped, UpstreamPayloadTooLargeError } from "./read-capped.ts";

test("readCapped returns full string when payload is within maxBytes", async () => {
  const content = "Hello, world!";
  const response = new Response(content, {
    headers: { "content-length": String(content.length) },
  });

  const result = await readCapped(response, 100);
  assert.equal(result, content);
});

test("readCapped returns empty string when body is null or empty", async () => {
  const response = new Response(null);
  const result = await readCapped(response, 100);
  assert.equal(result, "");
});

test("readCapped throws immediately when Content-Length exceeds maxBytes", async () => {
  const stream = new ReadableStream({
    start() {},
  });
  const response = new Response(stream, {
    headers: { "content-length": "1000" },
  });

  await assert.rejects(
    async () => {
      await readCapped(response, 500);
    },
    UpstreamPayloadTooLargeError,
  );

  assert.equal(response.bodyUsed, false, "Response body should not be locked or consumed");
});

test("readCapped throws and cancels stream when chunk total exceeds maxBytes", async () => {
  let streamCancelled = false;
  const chunk1 = new Uint8Array([1, 2, 3, 4]);
  const chunk2 = new Uint8Array([5, 6, 7, 8]);
  const chunk3 = new Uint8Array([9, 10]);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk1);
      controller.enqueue(chunk2);
      controller.enqueue(chunk3);
    },
    cancel() {
      streamCancelled = true;
    },
  });

  const response = new Response(stream);

  await assert.rejects(
    async () => {
      await readCapped(response, 6);
    },
    UpstreamPayloadTooLargeError,
  );

  assert.equal(streamCancelled, true, "Reader should be cancelled when limit is exceeded");
});

test("readCapped handles multi-byte UTF-8 split across chunks", async () => {
  // '€' is 3 bytes in UTF-8: 0xE2, 0x82, 0xAC
  const chunk1 = new Uint8Array([0xe2]);
  const chunk2 = new Uint8Array([0x82, 0xac]);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk1);
      controller.enqueue(chunk2);
      controller.close();
    },
  });

  const response = new Response(stream);
  const result = await readCapped(response, 10);
  assert.equal(result, "€");
});
