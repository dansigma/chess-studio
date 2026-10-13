import assert from "node:assert/strict";
import test from "node:test";
import {
  clientIp,
  createRateLimiter,
  createRouteLimiter,
  rateLimitKey,
  MAX_KEYS,
} from "./rate-limit.ts";

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
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8 " })), "5.6.7.8");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": ", 5.6.7.8, " })), "5.6.7.8");
  assert.equal(clientIp(new Headers({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
  assert.equal(
    clientIp(new Headers({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" })),
    "1.1.1.1",
  );
  assert.equal(clientIp(new Headers()), "unknown");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": ",  , " })), "unknown");
  assert.equal(
    clientIp(new Headers({ "x-forwarded-for": ",  , ", "x-real-ip": "9.9.9.9" })),
    "9.9.9.9",
  );
});

test("clientIp trusts cf-connecting-ip first", () => {
  assert.equal(
    clientIp(
      new Headers({
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "2.2.2.2",
      }),
    ),
    "203.0.113.9",
  );
  assert.equal(
    clientIp(new Headers({ "cf-connecting-ip": " 203.0.113.9 " })),
    "203.0.113.9",
  );
  assert.equal(
    clientIp(
      new Headers({ "cf-connecting-ip": "   ", "x-real-ip": "9.9.9.9" }),
    ),
    "9.9.9.9",
  );
  assert.equal(
    clientIp(
      new Headers({ "cf-connecting-ip": "  ", "x-forwarded-for": "1.1.1.1" }),
    ),
    "1.1.1.1",
  );
});

test("createRouteLimiter maps native success verdicts", async () => {
  const allowed = createRouteLimiter({
    limit: 60,
    windowMs: 60_000,
    bindingName: "RL_60_MIN",
    resolveBindingForTest: async () => ({
      limit: async () => ({ success: true }),
    }),
  });
  assert.deepEqual(await allowed.checkAsync("explorer:1.2.3.4"), { ok: true });

  const denied = createRouteLimiter({
    limit: 60,
    windowMs: 60_000,
    bindingName: "RL_60_MIN",
    resolveBindingForTest: async () => ({
      limit: async () => ({ success: false }),
    }),
  });
  assert.deepEqual(await denied.checkAsync("explorer:1.2.3.4"), {
    ok: false,
    retryAfterSeconds: 60,
  });
});

test("createRouteLimiter falls back to memory when the binding is missing", async () => {
  const limiter = createRouteLimiter({
    limit: 2,
    windowMs: 60_000,
    bindingName: "RL_60_MIN",
    resolveBindingForTest: async () => undefined,
  });
  assert.deepEqual(await limiter.checkAsync("k"), { ok: true });
  assert.deepEqual(await limiter.checkAsync("k"), { ok: true });
  const verdict = await limiter.checkAsync("k");
  assert.equal(verdict.ok, false);
  assert.ok(
    !verdict.ok && verdict.retryAfterSeconds > 0,
    "expected retryAfterSeconds > 0",
  );
});

test("createRouteLimiter falls back to memory when limit() throws", async () => {
  const limiter = createRouteLimiter({
    limit: 1,
    windowMs: 60_000,
    bindingName: "RL_60_MIN",
    resolveBindingForTest: async () => ({
      limit: async () => {
        throw new Error("edge down");
      },
    }),
  });
  assert.deepEqual(await limiter.checkAsync("k"), { ok: true });
  assert.equal((await limiter.checkAsync("k")).ok, false);
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

test("drains expired windows past MAX_KEYS while a recent active bucket survives", () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => now });
  for (let i = 0; i < MAX_KEYS - 1; i++) {
    assert.deepEqual(limiter.check(`old-${i}`), { ok: true });
  }
  now = 500;
  assert.deepEqual(limiter.check("recent"), { ok: true });
  assert.deepEqual(limiter.check("recent"), { ok: true });
  now = 1_100;
  for (let i = 0; i < 200; i++) {
    assert.deepEqual(limiter.check(`flood-${i}`), { ok: true });
  }
  assert.equal(limiter.check("recent").ok, false);
  assert.deepEqual(limiter.check("old-0"), { ok: true });
  assert.deepEqual(limiter.check("flood-0"), { ok: true });
  assert.equal(limiter.check("flood-0").ok, false);
});

test("rateLimitKey routes unknown IPs to a shared bucket", () => {
  assert.equal(rateLimitKey("explorer", "unknown"), "explorer:unknown");
  assert.equal(rateLimitKey("explorer", "1.2.3.4"), "explorer:1.2.3.4");
});

test("createRouteLimiter enforces the shared unknown bucket via checkAsync", async () => {
  const limiter = createRouteLimiter({
    limit: 2,
    windowMs: 60_000,
    bindingName: "RL_60_MIN",
    resolveBindingForTest: async () => undefined,
  });
  const key = rateLimitKey("explorer", clientIp(new Headers()));
  assert.equal(key, "explorer:unknown");
  assert.deepEqual(await limiter.checkAsync(key), { ok: true });
  assert.deepEqual(await limiter.checkAsync(key), { ok: true });
  assert.equal((await limiter.checkAsync(key)).ok, false);
});

test("createRouteLimiter enforces the long fallback window when the edge binding allows", async () => {
  let now = 0;
  const limiter = createRouteLimiter({
    limit: 2,
    windowMs: 10 * 60 * 1000,
    bindingName: "RL_AUTH",
    now: () => now,
    resolveBindingForTest: async () => ({
      limit: async () => ({ success: true }),
    }),
  });
  assert.deepEqual(await limiter.checkAsync("auth:1.2.3.4"), { ok: true });
  assert.deepEqual(await limiter.checkAsync("auth:1.2.3.4"), { ok: true });
  now = 61_000;
  assert.equal((await limiter.checkAsync("auth:1.2.3.4")).ok, false);
});
