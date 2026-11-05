// SIG-1226: the local opening book R2 route (unconfigured bucket, bad names,
// missing object, read failure, immutable serving).
import test from "node:test";
import assert from "node:assert/strict";
import { fakeEngineBucket, setCloudflareEnv } from "@/src/test-utils/route-test.ts";

const { GET } = await import("./route.ts");

function params(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

const URL_OF = (file: string) => new Request(`http://app.test/book/${file}`);

test("503 when the bucket is not configured", async () => {
  setCloudflareEnv({});
  const res = await GET(URL_OF("opening-book-v1.bin.gz"), params(["opening-book-v1.bin.gz"]));
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("only flat opening-book-*.bin.gz names are served", async () => {
  setCloudflareEnv({ ENGINE: fakeEngineBucket({ "book/secret.txt": { body: "x" }, "engine/stockfish.wasm": { body: "x" } }) });
  for (const path of [["secret.txt"], ["..", "engine", "stockfish.wasm"], ["opening-book-v1.bin.gz", "x"], ["opening-book-../x.bin.gz"]]) {
    const res = await GET(URL_OF(path.join("/")), params(path));
    assert.equal(res.status, 404, path.join("/"));
  }
});

test("404 for a missing object, no-store", async () => {
  setCloudflareEnv({ ENGINE: fakeEngineBucket({}) });
  const res = await GET(URL_OF("opening-book-v7.bin.gz"), params(["opening-book-v7.bin.gz"]));
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("500 with no-store when the bucket read fails", async () => {
  setCloudflareEnv({ ENGINE: { get: async () => { throw new Error("r2 down"); } } });
  const res = await GET(URL_OF("opening-book-v1.bin.gz"), params(["opening-book-v1.bin.gz"]));
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("serves the file as immutable opaque bytes under the book/ key prefix", async () => {
  setCloudflareEnv({
    ENGINE: fakeEngineBucket({
      "book/opening-book-v1.bin.gz": { body: "gz-bytes", etag: '"book-etag"', contentType: "application/gzip" },
    }),
  });
  const res = await GET(URL_OF("opening-book-v1.bin.gz"), params(["opening-book-v1.bin.gz"]));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "gz-bytes");
  assert.equal(res.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(res.headers.get("Content-Encoding"), null);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(res.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  assert.equal(res.headers.get("ETag"), '"book-etag"');
});
