import assert from "node:assert/strict";
import test from "node:test";
import { tooManyRequests } from "./rate-limit-response.ts";

test("tooManyRequests returns 429 with the shared body and Retry-After header", async () => {
  const res = tooManyRequests({ retryAfterSeconds: 42 });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "42");
  assert.deepEqual(await res.json(), { error: "Too many requests — try again shortly." });
});
