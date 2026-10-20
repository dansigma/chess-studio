import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CSP_HEADER,
  applySecurityHeaders,
  buildCsp,
  staticSecurityHeaders,
} from "./security-headers";

function directive(csp: string, name: string): string[] {
  const found = csp.split("; ").find((d) => d.startsWith(`${name} `));
  assert.ok(found, `missing directive ${name}`);
  return found.split(" ").slice(1);
}

describe("security headers", () => {
  const csp = buildCsp({ supabaseUrl: "https://proj.supabase.co/rest/v1" });

  it("ships as Report-Only", () => {
    assert.equal(CSP_HEADER, "Content-Security-Policy-Report-Only");
  });

  it("allows same-origin and inline scripts plus WASM, and eval only in dev", () => {
    const script = directive(csp, "script-src");
    assert.ok(script.includes("'self'"));
    assert.ok(script.includes("'unsafe-inline'"));
    assert.ok(script.includes("'wasm-unsafe-eval'"));
    assert.ok(!script.includes("'unsafe-eval'"));
    assert.ok(directive(buildCsp({ isDev: true }), "script-src").includes("'unsafe-eval'"));
  });

  it("locks down framing, objects and base", () => {
    assert.deepEqual(directive(csp, "frame-ancestors"), ["'none'"]);
    assert.deepEqual(directive(csp, "object-src"), ["'none'"]);
    assert.deepEqual(directive(csp, "base-uri"), ["'self'"]);
  });

  it("allows the app's known external sources", () => {
    assert.ok(directive(csp, "connect-src").includes("https://proj.supabase.co"));
    assert.ok(directive(csp, "connect-src").includes("wss://proj.supabase.co"));
    assert.ok(directive(csp, "img-src").includes("https://images.unsplash.com"));
    assert.ok(directive(csp, "frame-src").includes("https://www.youtube-nocookie.com"));
    assert.ok(directive(csp, "frame-src").includes("https://player.vimeo.com"));
    assert.ok(directive(csp, "worker-src").includes("blob:"));
  });

  it("applies static headers, HSTS only in production, and always X-Frame-Options", () => {
    assert.equal(staticSecurityHeaders(false)["Strict-Transport-Security"], undefined);
    const res = new Response(null);
    applySecurityHeaders(res, csp, true);
    assert.equal(res.headers.get("X-Frame-Options"), "DENY");
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.equal(res.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
    assert.equal(res.headers.get(CSP_HEADER), csp);
  });
});
