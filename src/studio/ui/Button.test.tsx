import assert from "node:assert/strict";
import { after, before, afterEach, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button.tsx";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

test("Button danger variant applies tinted studio-danger styling and disabled classes", () => {
  render(<Button variant="danger">Delete</Button>);
  const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
  assert.equal(button.type, "button");
  assert.match(button.className, /border-studio-danger\/40/);
  assert.match(button.className, /bg-studio-danger\/15/);
  assert.match(button.className, /text-studio-danger/);
  assert.match(button.className, /hover:bg-studio-danger\/25/);
  assert.match(button.className, /disabled:bg-studio-hover-strong/);
  assert.match(button.className, /disabled:text-studio-disabled/);
});

test("Button respects disabled and fires onClick when enabled", () => {
  let clicks = 0;
  const { rerender } = render(
    <Button variant="danger" disabled onClick={() => { clicks += 1; }}>
      Confirm
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
  assert.equal(button.disabled, true);
  fireEvent.click(button);
  assert.equal(clicks, 0);

  rerender(
    <Button variant="danger" onClick={() => { clicks += 1; }}>
      Confirm
    </Button>,
  );
  assert.equal(button.disabled, false);
  fireEvent.click(button);
  assert.equal(clicks, 1);
});
