// SIG-1310: native <select> popup lists must be themed through the studio
// tokens (they switch with the theme), not left to the browser's white default.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function rule(selector: RegExp): string {
  const match = selector.exec(css);
  assert.ok(match, `rule ${selector} exists`);
  return match[1];
}

test("select options and optgroups use studio tokens", () => {
  const body = rule(/select option,\s*select optgroup\s*\{([^}]*)\}/);
  assert.match(body, /background-color:\s*var\(--studio-elevated\)/);
  assert.match(body, /color:\s*var\(--studio-fg\)/);
  assert.doesNotMatch(body, /#|rgb|zinc|white/);
});

test("select inherits the document color-scheme", () => {
  assert.match(rule(/\n\s*select\s*\{([^}]*)\}/), /color-scheme:\s*inherit/);
});

test("the option rule sits inside @layer base", () => {
  const layer = css.indexOf("@layer base {");
  assert.ok(layer >= 0);
  assert.ok(css.indexOf("select option,", layer) > layer);
});
