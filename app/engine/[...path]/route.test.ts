// Tests for the engine R2 route: unconfigured bucket, missing objects, wasm
// serving with isolation headers, and non-wasm content types
// (see `.artifacts/plans/issue-932.md` Phase 4).
import test from "node:test";
import assert from "node:assert/strict";
import { fakeEngineBucket, setCloudflareEnv } from "@/src/test-utils/route-test.ts";

const { GET } = await import("./route.ts");

function params(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

test("returns 503 when the ENGINE bucket is not configured", async () => {
  setCloudflareEnv({});
  const res = await GET(new Request("http://app.test/engine/full/stockfish-19.wasm"), params(["full", "stockfish-19.wasm"]));
  assert.equal(res.status, 503);
  assert.equal(await res.text(), "Engine bucket not configured");
});

test("returns 404 for a missing object", async () => {
  setCloudflareEnv({ ENGINE: fakeEngineBucket({}) });
  const res = await GET(new Request("http://app.test/engine/full/stockfish-19.wasm"), params(["full", "stockfish-19.wasm"]));
  assert.equal(res.status, 404);
});

test("serves wasm with isolation headers and immutable caching", async () => {
  setCloudflareEnv({
    ENGINE: fakeEngineBucket({ "engine/full/stockfish-19.wasm": { body: "wasm-bytes", etag: '"wasm-etag"' } }),
  });
  const res = await GET(
    new Request("http://app.test/engine/full/stockfish-19.wasm"),
    params(["full", "stockfish-19.wasm"]),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/wasm");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(res.headers.get("Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(res.headers.get("Cross-Origin-Embedder-Policy"), "require-corp");
  assert.equal(res.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal(res.headers.get("ETag"), '"wasm-etag"');
  assert.equal(res.headers.get("Content-Length"), String(new TextEncoder().encode("wasm-bytes").length));
  assert.equal(await res.text(), "wasm-bytes");
});

test("maps nested paths onto R2 keys", async () => {
  const bucket = fakeEngineBucket({ "engine/nested/deep/worker.js": { body: "worker" } });
  let seenKey = "";
  const spy = { get: async (key: string) => ((seenKey = key), bucket.get(key)) };
  setCloudflareEnv({ ENGINE: spy });
  const res = await GET(new Request("http://app.test/engine/nested/deep/worker.js"), params(["nested", "deep", "worker.js"]));
  assert.equal(res.status, 200);
  assert.equal(seenKey, "engine/nested/deep/worker.js");
});

test("keeps the object's content type for non-wasm assets", async () => {
  setCloudflareEnv({
    ENGINE: fakeEngineBucket({
      "engine/worker.js": { body: "worker", contentType: "text/javascript" },
    }),
  });
  const res = await GET(new Request("http://app.test/engine/worker.js"), params(["worker.js"]));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/javascript");
});

test("defaults to octet-stream for non-wasm assets without metadata", async () => {
  setCloudflareEnv({ ENGINE: fakeEngineBucket({ "engine/blob.bin": { body: "bin" } }) });
  const res = await GET(new Request("http://app.test/engine/blob.bin"), params(["blob.bin"]));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "application/octet-stream");
});
