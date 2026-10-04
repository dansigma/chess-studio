import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeAuthNext } from "./redirect-path.ts";

describe("safeAuthNext", () => {
  it("accepts exact allowlisted prefixes", () => {
    assert.equal(safeAuthNext("/studio"), "/studio");
    assert.equal(safeAuthNext("/courses"), "/courses");
    assert.equal(safeAuthNext("/login/update-password"), "/login/update-password");
  });

  it("accepts subpaths and query strings under allowlisted prefixes", () => {
    assert.equal(safeAuthNext("/studio/x?y=1"), "/studio/x?y=1");
    assert.equal(safeAuthNext("/courses/admin"), "/courses/admin");
    assert.equal(safeAuthNext("/login/update-password?code=abc"), "/login/update-password?code=abc");
  });

  it("rejects protocol-relative, backslash, and traversal payloads", () => {
    assert.equal(safeAuthNext("//evil.com"), "/studio");
    assert.equal(safeAuthNext("/\\evil"), "/studio");
    assert.equal(safeAuthNext("/../etc"), "/studio");
    assert.equal(safeAuthNext("https://evil.com"), "/studio");
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
