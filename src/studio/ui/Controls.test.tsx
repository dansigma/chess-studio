import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Segmented, Tooltip } from "./Controls.tsx";

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

test("Segmented renders radiogroup with roving tabindex, titles, click and arrow-key navigation", () => {
  const seen: string[] = [];
  const options = [
    { value: "fast", label: "Fast", title: "Fast (depth 10)" },
    { value: "standard", label: "Standard", title: "Standard (depth 14)" },
    { value: "deep", label: "Deep", title: "Deep (depth 18)" },
  ] as const;

  const { rerender } = render(
    <Segmented
      compact
      ariaLabel="Depth"
      value="standard"
      options={options}
      onChange={(next) => {
        seen.push(next);
      }}
    />,
  );

  const group = screen.getByRole("radiogroup", { name: "Depth" });
  assert.ok(group);
  const radios = screen.getAllByRole("radio");
  assert.equal(radios.length, 3);
  assert.equal(radios[0].getAttribute("aria-checked"), "false");
  assert.equal(radios[1].getAttribute("aria-checked"), "true");
  assert.equal(radios[2].getAttribute("aria-checked"), "false");
  assert.equal(radios[0].getAttribute("tabindex"), "-1");
  assert.equal(radios[1].getAttribute("tabindex"), "0");
  assert.equal(radios[2].getAttribute("tabindex"), "-1");
  assert.equal(radios[0].getAttribute("title"), "Fast (depth 10)");

  fireEvent.click(radios[2]);
  assert.deepEqual(seen, ["deep"]);

  fireEvent.keyDown(radios[1], { key: "ArrowRight" });
  assert.deepEqual(seen, ["deep", "deep"]);
  fireEvent.keyDown(radios[0], { key: "ArrowLeft" });
  assert.deepEqual(seen, ["deep", "deep", "deep"]);

  rerender(
    <Segmented
      compact
      ariaLabel="Depth"
      disabled
      value="standard"
      options={options}
      onChange={(next) => {
        seen.push(next);
      }}
    />,
  );
  for (const radio of screen.getAllByRole("radio") as HTMLButtonElement[]) {
    assert.equal(radio.disabled, true);
  }
});
