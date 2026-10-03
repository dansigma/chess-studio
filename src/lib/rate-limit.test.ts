import assert from "node:assert/strict";
import test from "node:test";
import { clientIp, createRateLimiter, MAX_KEYS } from "./rate-limit.ts";

test("allows requests under the limit", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(limiter.check("a"), { ok: true });
  }
});

test("blocks over the limit with a positive retryAfterSeconds", () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
  limiter.check("a");
  limiter.check("a");
  const verdict = limiter.check("a");
  assert.equal(verdict.ok, false);
  assert.ok(
    !verdict.ok && verdict.retryAfterSeconds > 0,
    "expected retryAfterSeconds > 0",
  );
});

test("resets the window with an injected clock", () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
  assert.deepEqual(limiter.check("a"), { ok: true });
  assert.equal(limiter.check("a").ok, false);
  now = 1_001;
  assert.deepEqual(limiter.check("a"), { ok: true });
});

test("tracks distinct keys independently", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  assert.deepEqual(limiter.check("a"), { ok: true });
  assert.deepEqual(limiter.check("b"), { ok: true });
  assert.equal(limiter.check("a").ok, false);
  assert.equal(limiter.check("b").ok, false);
});

test("clientIp uses the right-most forwarded entry, then x-real-ip, then unknown", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })), "5.6.7.8");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8 " })), "5.6.7.8");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": ", 5.6.7.8, " })), "5.6.7.8");
  assert.equal(clientIp(new Headers({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
  assert.equal(
    clientIp(new Headers({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" })),
    "1.1.1.1",
  );
  assert.equal(clientIp(new Headers()), "unknown");
});

test("keeps enforcing limits past MAX_KEYS and evicts the least-recently-touched bucket", () => {
  const now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });
  assert.deepEqual(limiter.check("victim"), { ok: true });
  const firstOther = "other-0";
  for (let i = 0; i < MAX_KEYS - 1; i++) {
    assert.deepEqual(limiter.check(`other-${i}`), { ok: true });
  }
  assert.deepEqual(limiter.check("victim"), { ok: true });
  assert.deepEqual(limiter.check("newcomer"), { ok: true });
  assert.equal(limiter.check("victim").ok, false);
  assert.deepEqual(limiter.check(firstOther), { ok: true });
});
