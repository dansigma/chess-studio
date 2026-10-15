import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSiteUrl } from "./site-url.ts";

describe("resolveSiteUrl", () => {
  describe("production environment", () => {
    it("returns error if NEXT_PUBLIC_SITE_URL is not set", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: undefined,
        origin: "https://attacker.com",
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(
          result.error,
          "Authentication service is temporarily unavailable.",
        );
        assert.match(result.cause, /required in production/);
      }
    });

    it("returns error if NEXT_PUBLIC_SITE_URL is empty string or whitespace", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: "   ",
        origin: "https://attacker.com",
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.cause, /required in production/);
      }
    });

    it("returns error if NEXT_PUBLIC_SITE_URL is not a valid URL", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: "not-a-valid-url",
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.cause, /not a valid URL/);
      }
    });

    it("returns error if NEXT_PUBLIC_SITE_URL uses http: instead of https:", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: "http://chess.example.com",
      });

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.match(result.cause, /must use https: in production/);
      }
    });

    it("accepts valid https URL and ignores request origin", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: "https://chess.example.com",
        origin: "https://attacker.com",
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.url, "https://chess.example.com");
      }
    });

    it("strips trailing slash from valid https URL", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: "https://chess.example.com/",
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.url, "https://chess.example.com");
      }
    });

    it("preserves path prefix without trailing slashes", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: "https://chess.example.com/app///",
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.url, "https://chess.example.com/app");
      }
    });

    it("never falls back to localhost:3000 in production when var is missing", () => {
      const result = resolveSiteUrl({
        nodeEnv: "production",
        siteUrl: null,
        origin: null,
      });

      assert.strictEqual(result.ok, false);
    });
  });

  describe("non-production environment (development / test)", () => {
    it("prefers NEXT_PUBLIC_SITE_URL if provided", () => {
      const result = resolveSiteUrl({
        nodeEnv: "development",
        siteUrl: "https://dev.example.com/",
        origin: "http://localhost:5173",
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.url, "https://dev.example.com");
      }
    });

    it("falls back to request Origin if NEXT_PUBLIC_SITE_URL is not set", () => {
      const result = resolveSiteUrl({
        nodeEnv: "development",
        siteUrl: undefined,
        origin: "http://localhost:5173/",
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.url, "http://localhost:5173");
      }
    });

    it("falls back to http://localhost:3000 if neither siteUrl nor origin is set", () => {
      const result = resolveSiteUrl({
        nodeEnv: "development",
        siteUrl: undefined,
        origin: undefined,
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.url, "http://localhost:3000");
      }
    });

    it("falls back to localhost:3000 if origin is invalid URL", () => {
      const result = resolveSiteUrl({
        nodeEnv: "test",
        siteUrl: undefined,
        origin: "invalid-origin",
      });

      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.url, "http://localhost:3000");
      }
    });
  });
});
