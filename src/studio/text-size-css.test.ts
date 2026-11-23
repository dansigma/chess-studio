// SIG-1461: the text-size setting only works if the text-dense / text-caption
// utilities read the CSS variables that [data-text-size] overrides. Tokens in
// `@theme inline` compile to fixed px values, so guard against that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { compile } from "@tailwindcss/node";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "../../app");

test("text-dense and text-caption read the overridable size variables", async () => {
  const css = readFileSync(join(appDir, "globals.css"), "utf8");
  const compiler = await compile(css, { base: appDir, onDependency() {} });
  const out = compiler.build(["text-dense", "text-caption"]).replace(/\s+/g, " ");
  assert.match(out, /\.text-dense \{ font-size: var\(--text-dense\);/);
  assert.match(out, /\.text-caption \{ font-size: var\(--text-caption\);/);
  assert.match(out, /\[data-text-size="large"\] \{[^}]*--text-dense: 14px;/);
  assert.match(out, /\[data-text-size="small"\] \{[^}]*--text-dense: 11px;/);
});
