import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom";
import { handleDockRestoreKey, readNormalDockSnapshot } from "./dock-maximize";

before(() => setupDom());
after(() => teardownDom());

test("autosave skips serialization while a group is maximized", () => {
  const toJSON = mock.fn(() => { throw new Error("The maximized layout must not be serialized"); });
  assert.equal(readNormalDockSnapshot({ hasMaximizedGroup: () => true, toJSON }), null);
  assert.equal(toJSON.mock.callCount(), 0);
});

test("Escape restores only when a menu, dialog or editor does not own it", () => {
  const api = { hasMaximizedGroup: () => true, exitMaximizedGroup: mock.fn() };
  const pressEscape = (target: HTMLElement = document.body) => {
    const event = new window.KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    target.addEventListener("keydown", (event) => handleDockRestoreKey(event, api), { once: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };

  const overlays = document.createElement("div");
  overlays.innerHTML = '<div role="menu"></div><div role="dialog" aria-modal="true"></div><input>';
  document.body.append(overlays);
  try {
    assert.equal(pressEscape(), false);
    overlays.querySelector('[role="menu"]')?.remove();
    assert.equal(pressEscape(), false);
    overlays.querySelector('[role="dialog"]')?.remove();
    assert.equal(pressEscape(overlays.querySelector("input")!), false);
    assert.equal(api.exitMaximizedGroup.mock.callCount(), 0);
    assert.equal(pressEscape(), true);
    assert.equal(api.exitMaximizedGroup.mock.callCount(), 1);
  } finally {
    overlays.remove();
  }
});
