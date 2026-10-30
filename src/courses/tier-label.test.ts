import assert from "node:assert/strict";
import test from "node:test";
import { tierLabel } from "./tier-label.ts";

test("tier label renders free and premium in both locales", () => {
  assert.equal(tierLabel("free", null, "en"), "Free");
  assert.equal(tierLabel("free", null, "pt-br"), "Gratuito");
  assert.equal(tierLabel("premium", null, "en"), "Premium");
  assert.equal(tierLabel("premium", null, "pt-br"), "Premium");
});

test("tier label formats the paid price in BRL per locale", () => {
  assert.equal(tierLabel("paid", 1990, "en"), "R$ 19.90");
  assert.equal(tierLabel("paid", 1990, "pt-br"), "R$ 19,90");
  assert.equal(tierLabel("paid", 123456, "pt-br"), "R$ 1.234,56");
});

test("tier label throws for paid without a valid price", () => {
  assert.throws(() => tierLabel("paid", null, "en"), RangeError);
  assert.throws(() => tierLabel("paid", 0, "en"), RangeError);
  assert.throws(() => tierLabel("paid", -5, "pt-br"), RangeError);
});
