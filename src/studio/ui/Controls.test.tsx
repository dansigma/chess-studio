import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { Tooltip } from "./Controls.tsx";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

test("Tooltip shows on both hover and keyboard focus-within", () => {
  render(
    <Tooltip label="Settings" shortcut="Ctrl+,">
      <button type="button">Open</button>
    </Tooltip>,
  );
  const tooltip = screen.getByRole("tooltip");
  const wrapper = tooltip.parentElement!;
  assert.match(wrapper.className, /\bgroup\/tip\b/);
  assert.match(tooltip.className, /\bgroup-hover\/tip:flex\b/);
  assert.match(tooltip.className, /\bgroup-focus-within\/tip:flex\b/);
  assert.match(tooltip.className, /z-\[1100\]/);
});

test("Tooltip omits bubble when disabled", () => {
  render(
    <Tooltip label="Settings" disabled>
      <button type="button">Open</button>
    </Tooltip>,
  );
  assert.equal(screen.queryByRole("tooltip"), null);
});
