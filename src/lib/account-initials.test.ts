import assert from "node:assert/strict";
import { test } from "node:test";
import { accountInitials } from "./account-initials.ts";

test("two-word name: first + last initials", () => {
  assert.equal(accountInitials("Danilo Alves", "x@y.com"), "DA");
});

test("one-word name: a single letter", () => {
  assert.equal(accountInitials("Danilo", "x@y.com"), "D");
});

test("multi-word lowercase name uses first and last word", () => {
  assert.equal(accountInitials("maria da silva", "x@y.com"), "MS");
});

test("unicode letters are kept and uppercased", () => {
  assert.equal(accountInitials("Ângela Dias", "x@y.com"), "ÂD");
  assert.equal(accountInitials("érica", "x@y.com"), "É");
});

test("leading non-letters are skipped; letterless words are ignored", () => {
  assert.equal(accountInitials('  "Danilo" -Alves  ', "x@y.com"), "DA");
  assert.equal(accountInitials("(  ) Ana - 3", "x@y.com"), "A");
});

test("astral letters are not split", () => {
  assert.equal(accountInitials("𝒜da", "x@y.com"), "𝒜");
});

test("without a name the e-mail behaviour is unchanged", () => {
  assert.equal(accountInitials(null, "danilo.alves@x.com"), "DA");
  assert.equal(accountInitials(undefined, "danvalves@x.com"), "DA");
  assert.equal(accountInitials("", "maria_silva@x.com"), "MS");
  assert.equal(accountInitials("   ", "z@x.com"), "Z");
  assert.equal(accountInitials("123 --", "bob@x.com"), "BO");
  assert.equal(accountInitials(null, "@x.com"), "?");
});
