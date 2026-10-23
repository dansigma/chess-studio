import assert from "node:assert/strict";
import test from "node:test";
import { __resetEmailTestState } from "./send.ts";
import { jsonResponse, mockFetch } from "@/src/test-utils/route-test.ts";

const { sendEmail } = await import("./send.ts");

const RECIPIENT = "user@example.com";
const BODY_TEXT = "hello-body-marker";

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function withEnv(t: Parameters<typeof mockFetch>[0], vars: Record<string, string | undefined>): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
  }
  setEnv(vars);
  t.after(() => {
    setEnv(saved);
  });
  __resetEmailTestState();
  t.after(() => {
    __resetEmailTestState();
  });
}

function captureLogs(t: Parameters<typeof mockFetch>[0]): { warn: string[]; error: string[] } {
  const warn: string[] = [];
  const error: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args: unknown[]) => {
    warn.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    error.push(args.map(String).join(" "));
  };
  t.after(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });
  return { warn, error };
}

function baseInput() {
  return {
    to: RECIPIENT,
    subject: "Welcome",
    text: BODY_TEXT,
    tag: "test-tag",
  };
}

test("success posts to Resend with auth, idempotency key and default from/reply_to", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  mockFetch(t, (url, init) => {
    seenUrl = url;
    seenInit = init;
    return jsonResponse({ id: "email_123" }, 200);
  });

  const result = await sendEmail({ ...baseInput(), idempotencyKey: "key-abc" });

  assert.deepEqual(result, { ok: true, id: "email_123" });
  assert.equal(seenUrl, "https://api.resend.com/emails");
  assert.equal(seenInit?.method, "POST");
  const headers = new Headers(seenInit?.headers);
  assert.equal(headers.get("Authorization"), "Bearer re_test_key");
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("Idempotency-Key"), "key-abc");
  const body = JSON.parse(String(seenInit?.body));
  assert.equal(body.from, '"Xadrez Digital" <no-reply@xadrez.digital>');
  assert.equal(body.reply_to, "contato@xadrez.digital");
  assert.equal(body.to, RECIPIENT);
  assert.equal(body.subject, "Welcome");
});

test("omitted idempotency key still sends a non-empty Idempotency-Key header", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  let seenInit: RequestInit | undefined;
  mockFetch(t, (_url, init) => {
    seenInit = init;
    return jsonResponse({ id: "email_456" }, 200);
  });

  const result = await sendEmail(baseInput());

  assert.deepEqual(result, { ok: true, id: "email_456" });
  const key = new Headers(seenInit?.headers).get("Idempotency-Key");
  assert.ok(key && key.length > 0);
});

test("env overrides and per-call replyTo are reflected in the body", async (t) => {
  withEnv(t, {
    RESEND_API_KEY: "re_test_key",
    EMAIL_FROM: '"Custom" <custom@xadrez.digital>',
    EMAIL_REPLY_TO: "reply@xadrez.digital",
  });
  const bodies: unknown[] = [];
  mockFetch(t, (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonResponse({ id: "email_789" }, 200);
  });

  await sendEmail(baseInput());
  assert.equal((bodies[0] as { from: string }).from, '"Custom" <custom@xadrez.digital>');
  assert.equal((bodies[0] as { reply_to: string }).reply_to, "reply@xadrez.digital");

  await sendEmail({ ...baseInput(), replyTo: "per-call@xadrez.digital" });
  assert.equal((bodies[1] as { reply_to: string }).reply_to, "per-call@xadrez.digital");
});

test("without a key no fetch is made and the result is not_configured", async (t) => {
  withEnv(t, { RESEND_API_KEY: undefined, EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  const logs = captureLogs(t);
  mockFetch(t, () => {
    throw new Error("must not fetch without a key");
  });

  const result = await sendEmail(baseInput());

  assert.deepEqual(result, { ok: false, reason: "not_configured" });
  assert.equal(logs.warn.length, 1);
  assert.match(logs.warn[0], /\[email\] RESEND_API_KEY missing, skipped test-tag/);
});

test("missing-key warning is logged once per process", async (t) => {
  withEnv(t, { RESEND_API_KEY: undefined, EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  const logs = captureLogs(t);
  mockFetch(t, () => {
    throw new Error("must not fetch without a key");
  });

  await sendEmail(baseInput());
  await sendEmail({ ...baseInput(), tag: "other-tag" });

  assert.equal(logs.warn.length, 1);
});

test("4xx and 5xx return ok:false without throwing and never log recipient or body", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  const logs = captureLogs(t);
  for (const status of [400, 500]) {
    mockFetch(t, () => jsonResponse({ error: "bad" }, status));
    const result = await sendEmail({ ...baseInput(), text: BODY_TEXT });
    assert.deepEqual(result, { ok: false, reason: "resend_error" });
  }
  const all = logs.error.join("\n");
  assert.match(all, /status=400/);
  assert.match(all, /status=500/);
  assert.ok(!all.includes(RECIPIENT), "logs must not contain the recipient");
  assert.ok(!all.includes(BODY_TEXT), "logs must not contain the body");
});

test("timeout returns ok:false without throwing", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  const logs = captureLogs(t);
  mockFetch(t, () => {
    const error = new Error("signal timed out");
    error.name = "TimeoutError";
    throw error;
  });

  const result = await sendEmail(baseInput());

  assert.deepEqual(result, { ok: false, reason: "timeout" });
  assert.match(logs.error.join("\n"), /status=timeout/);
});

test("network error returns ok:false without throwing", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  const logs = captureLogs(t);
  mockFetch(t, () => {
    throw new Error("fetch failed");
  });

  const result = await sendEmail(baseInput());

  assert.deepEqual(result, { ok: false, reason: "network_error" });
  assert.match(logs.error.join("\n"), /status=network/);
});

test("CR/LF in to, subject or headers is rejected before any request", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  mockFetch(t, () => {
    throw new Error("validation must happen before fetch");
  });

  assert.deepEqual(await sendEmail({ ...baseInput(), to: "a@b.com\ncc:evil@x.com" }), {
    ok: false,
    reason: "invalid_to",
  });
  assert.deepEqual(await sendEmail({ ...baseInput(), to: "a@b.com,other@c.com" }), {
    ok: false,
    reason: "invalid_to",
  });
  assert.deepEqual(await sendEmail({ ...baseInput(), subject: "hi\r\nBcc: evil@x.com" }), {
    ok: false,
    reason: "invalid_subject",
  });
  assert.deepEqual(await sendEmail({ ...baseInput(), headers: { "X-Tag": "a\nb" } }), {
    ok: false,
    reason: "invalid_headers",
  });
  assert.deepEqual(await sendEmail({ ...baseInput(), headers: { "X-Bad\r\n": "v" } }), {
    ok: false,
    reason: "invalid_headers",
  });
});

test("subject longer than 200 chars is rejected before any request", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  mockFetch(t, () => {
    throw new Error("validation must happen before fetch");
  });

  const result = await sendEmail({ ...baseInput(), subject: "s".repeat(201) });

  assert.deepEqual(result, { ok: false, reason: "subject_too_long" });
});

test("missing id in a 2xx response still resolves ok:true", async (t) => {
  withEnv(t, { RESEND_API_KEY: "re_test_key", EMAIL_FROM: undefined, EMAIL_REPLY_TO: undefined });
  mockFetch(t, () => jsonResponse({}, 200));

  const result = await sendEmail(baseInput());

  assert.deepEqual(result, { ok: true, id: "" });
});
