// SIG-1045 smoke test: proves Escape-to-close wiring works under happy-dom.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { Dialog } from "./Dialog.tsx";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

test("Dialog renders its children when open", () => {
  let closed = 0;
  const onClose = (): void => {
    closed += 1;
  };
  try {
    render(<Dialog title="About" onClose={onClose}>review-body-marker</Dialog>);
    assert.ok(screen.getByRole("dialog"));
    assert.ok(screen.getByText("review-body-marker"));
    assert.ok(screen.getByText("About"));
  } finally {
    assert.equal(closed, 0);
    cleanup();
  }
});

test("Dialog calls onClose on Escape", () => {
  let closed = 0;
  try {
    render(
      <Dialog title="About" onClose={() => { closed += 1; }}>
        review-body-marker
      </Dialog>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    assert.equal(closed, 1);
  } finally {
    cleanup();
  }
});
