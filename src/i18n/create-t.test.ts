import assert from "node:assert/strict";
import test from "node:test";
import { createT } from "./create-t.ts";

const EN = { hello: "Hello {name}", plain: "Plain" } as const;
const PT_BR = { hello: "Olá {name}", plain: "Simples" } as const;

test("createT returns the text for each locale", () => {
  const t = createT(EN, PT_BR);
  assert.equal(t("en", "plain"), "Plain");
  assert.equal(t("pt-br", "plain"), "Simples");
});

test("createT interpolates {placeholders} from vars", () => {
  const t = createT(EN, PT_BR);
  assert.equal(t("en", "hello", { name: "Ana" }), "Hello Ana");
  assert.equal(t("pt-br", "hello", { name: "Ana" }), "Olá Ana");
  assert.equal(t("en", "hello", { name: 42 }), "Hello 42");
});

test("createT interpolates multiple placeholders in one string", () => {
  const t = createT(
    { range: "{done} of {total} moves" },
    { range: "{done} de {total} lances" },
  );
  assert.equal(t("pt-br", "range", { done: 3, total: 20 }), "3 de 20 lances");
});

test("createT leaves tokens without a matching var intact", () => {
  const t = createT(EN, PT_BR);
  assert.equal(t("en", "hello"), "Hello {name}");
  assert.equal(t("en", "hello", { other: "x" }), "Hello {name}");
});
