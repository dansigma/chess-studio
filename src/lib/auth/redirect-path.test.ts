import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeAuthNext } from "./redirect-path.ts";

describe("safeAuthNext", () => {
  it("accepts exact allowlisted prefixes", () => {
    assert.equal(safeAuthNext("/studio"), "/studio");
    assert.equal(safeAuthNext("/courses"), "/courses");
    assert.equal(safeAuthNext("/login/update-password"), "/login/update-password");
    assert.equal(safeAuthNext("/admin/users"), "/admin/users");
    assert.equal(safeAuthNext("/coach-invite/abc123"), "/coach-invite/abc123");
  });

  it("accepts subpaths and query strings under allowlisted prefixes", () => {
    assert.equal(safeAuthNext("/studio/x?y=1"), "/studio/x?y=1");
    assert.equal(safeAuthNext("/courses/admin"), "/courses/admin");
    assert.equal(safeAuthNext("/admin/users?page=2"), "/admin/users?page=2");
    assert.equal(safeAuthNext("/coach-invite/abc123?x=1"), "/coach-invite/abc123?x=1");
    assert.equal(safeAuthNext("/login/update-password?code=abc"), "/login/update-password?code=abc");
  });

  it("rejects protocol-relative, backslash, and traversal payloads", () => {
    assert.equal(safeAuthNext("//evil.com"), "/studio");
    assert.equal(safeAuthNext("/\\evil"), "/studio");
    assert.equal(safeAuthNext("/../etc"), "/studio");
    assert.equal(safeAuthNext("https://evil.com"), "/studio");
  });

  it("rejects percent-encoded traversal that escapes the allowlist", () => {
    // %2e normalizes to a dot-segment before the guard runs: both collapse
    // to /admin — inside the allowlist, hence accepted (same convention as
    // "collapses encoded payloads that land inside the allowlist" below).
    assert.equal(safeAuthNext("/studio/%2e%2e/admin"), "/admin");
    assert.equal(safeAuthNext("/studio/%2E%2E/admin"), "/admin");
    assert.equal(safeAuthNext("/courses/%2e%2e/%2e%2e/etc"), "/studio");
  });

  it("collapses encoded payloads that land inside the allowlist", () => {
    assert.equal(safeAuthNext("/%2e%2e/studio"), "/studio");
    assert.equal(safeAuthNext("/studio?x=1"), "/studio?x=1");
  });

  it("rejects encoded slashes that survive parsing", () => {
    assert.equal(safeAuthNext("/studio/%2f%2fevil.com"), "/studio");
    assert.equal(safeAuthNext("/studio/%2e%2e%2fadmin"), "/studio");
  });

  it("rejects boundary siblings of allowlisted prefixes", () => {
    assert.equal(safeAuthNext("/studiox"), "/studio");
    assert.equal(safeAuthNext("/coursesx"), "/studio");
    assert.equal(safeAuthNext("/adminx"), "/studio");
    assert.equal(safeAuthNext("/admin@evil"), "/studio");
    assert.equal(safeAuthNext("/coach-invite@evil"), "/studio");
    assert.equal(safeAuthNext("/coach-invitex"), "/studio");
    assert.equal(safeAuthNext("//evil.example"), "/studio");
    assert.equal(safeAuthNext("/login/update-passwordx"), "/studio");
  });

  it("rejects absolute and protocol-relative off-origin URLs", () => {
    assert.equal(safeAuthNext("https://evil.com"), "/studio");
    assert.equal(safeAuthNext("http://evil.com/studio"), "/studio");
    assert.equal(safeAuthNext("//evil.com/studio"), "/studio");
  });

  it("rejects backslash payloads", () => {
    assert.equal(safeAuthNext("/studio\\evil"), "/studio");
    assert.equal(safeAuthNext("\\/evil.com"), "/studio");
  });

  it("rejects overlong values", () => {
    assert.equal(safeAuthNext(`/studio/${"a".repeat(512)}`), "/studio");
  });

  it("rejects non-allowlisted paths and non-string values", () => {
    assert.equal(safeAuthNext("/puzzles"), "/studio");
    assert.equal(safeAuthNext(""), "/studio");
    assert.equal(safeAuthNext(null), "/studio");
    assert.equal(safeAuthNext(undefined), "/studio");
    assert.equal(safeAuthNext(42), "/studio");
  });

  it("honors a custom fallback", () => {
    assert.equal(safeAuthNext("/puzzles", "/courses"), "/courses");
    assert.equal(safeAuthNext(null, "/courses"), "/courses");
  });
});
