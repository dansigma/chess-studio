import assert from "node:assert/strict";
import test from "node:test";
import { oauthRedirectTo } from "./oauth";

const ORIGIN = "https://xadrez.digital";
const FALLBACK = `${ORIGIN}/auth/callback?next=%2Fstudio`;

test("empty or missing next falls back to /studio", () => {
  assert.equal(oauthRedirectTo(ORIGIN, ""), FALLBACK);
  assert.equal(oauthRedirectTo(ORIGIN, undefined), FALLBACK);
});

test("keeps an allowed next, encoded", () => {
  assert.equal(
    oauthRedirectTo(ORIGIN, "/courses/abc?x=1&y=2"),
    `${ORIGIN}/auth/callback?next=${encodeURIComponent("/courses/abc?x=1&y=2")}`,
  );
});

test("rejects external and non-allowlisted next", () => {
  for (const bad of ["https://evil.example/studio", "//evil.example", "/\\evil", "/admin", "javascript:alert(1)"]) {
    assert.equal(oauthRedirectTo(ORIGIN, bad), FALLBACK, bad);
  }
});
