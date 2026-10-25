// Tests for the CSP report endpoint (SIG-1054): content types, size cap, parsing, logging and
// rate limiting. The response never carries the request input.
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "@/src/test-utils/stubs/next-server.ts";
import { nextTestIp } from "@/src/test-utils/route-test.ts";
import { MAX_CSP_REPORT_BYTES } from "@/src/lib/csp-report.ts";

const { POST } = await import("./route.ts");

const URL_ = "http://app.test/api/csp-report";

function post(body: string, contentType: string | null, ip = nextTestIp()): NextRequest {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (contentType) {
    headers["content-type"] = contentType;
  }
  return new NextRequest(URL_, { method: "POST", headers, body });
}

function captureWarn(t: TestContext): string[] {
  const lines: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    if (line.startsWith("csp-report ")) {
      lines.push(line);
    }
  });
  return lines;
}

const legacyReport = JSON.stringify({
  "csp-report": {
    "document-uri": "https://xadrez.digital/courses?x=1",
    "effective-directive": "frame-src",
    "blocked-uri": "https://www.youtube.com/embed/abc",
  },
});

test("accepts a report-uri body, logs one compact line and returns an empty 204", async (t) => {
  const lines = captureWarn(t);
  const res = await POST(post(legacyReport, "application/csp-report"));
  assert.equal(res.status, 204);
  assert.equal(await res.text(), "");
  assert.deepEqual(lines, ["csp-report report directive=frame-src blocked=www.youtube.com path=/courses"]);
});

test("accepts a Reporting API batch", async (t) => {
  const lines = captureWarn(t);
  const body = JSON.stringify([
    {
      type: "csp-violation",
      url: "https://xadrez.digital/studio",
      body: { effectiveDirective: "connect-src", blockedURL: "https://cdn.example/p.svg" },
    },
  ]);
  const res = await POST(post(body, "application/reports+json"));
  assert.equal(res.status, 204);
  assert.deepEqual(lines, ["csp-report report directive=connect-src blocked=cdn.example path=/studio"]);
});

test("rejects other content types with 415", async (t) => {
  const lines = captureWarn(t);
  const res = await POST(post(legacyReport, "application/json"));
  assert.equal(res.status, 415);
  assert.equal(await res.text(), "");
  assert.deepEqual(lines, []);
});

test("rejects malformed JSON with an empty 400", async () => {
  const res = await POST(post("{nope", "application/csp-report"));
  assert.equal(res.status, 400);
  assert.equal(await res.text(), "");
});

test("rejects bodies over the cap with 413", async (t) => {
  const lines = captureWarn(t);
  const res = await POST(post("x".repeat(MAX_CSP_REPORT_BYTES + 1), "application/csp-report"));
  assert.equal(res.status, 413);
  assert.deepEqual(lines, []);
});

test("rate-limits after 60 reports from one IP", async (t) => {
  captureWarn(t);
  const ip = nextTestIp();
  let last = 0;
  for (let i = 0; i < 61; i += 1) {
    const res = await POST(post(legacyReport, "application/csp-report", ip));
    await res.text();
    last = res.status;
  }
  assert.equal(last, 429);
});
