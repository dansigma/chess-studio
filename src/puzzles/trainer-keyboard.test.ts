import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import {
  hasOpenDialog,
  isEditableTarget,
  isInteractiveTarget,
  resolveTrainerKeyAction,
} from "./trainer-keyboard";

before(() => setupDom());
after(() => teardownDom());

const baseInput = {
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  inEditable: false,
  inInteractive: false,
  dialogOpen: false,
  userTurn: false,
  canContinue: false,
  canScrub: false,
};

test("resolveTrainerKeyAction maps h/H to hint only during the user's turn", () => {
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "h", userTurn: true }), "hint");
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "H", shiftKey: true, userTurn: true }), "hint");
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "h", userTurn: false }), null);
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "h", userTurn: true, inEditable: true }), null);
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "h", userTurn: true, dialogOpen: true }), null);
});

test("resolveTrainerKeyAction maps Enter and Space to continue only when non-interactive and finished", () => {
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "Enter", canContinue: true }), "continue");
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: " ", canContinue: true }), "continue");
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "Enter", canContinue: false }), null);
  assert.equal(
    resolveTrainerKeyAction({ ...baseInput, key: "Enter", canContinue: true, inInteractive: true }),
    null,
  );
  assert.equal(
    resolveTrainerKeyAction({ ...baseInput, key: " ", canContinue: true, inInteractive: true }),
    null,
  );
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "Enter", canContinue: true, dialogOpen: true }), null);
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "Enter", canContinue: true, ctrlKey: true }), null);
});

test("resolveTrainerKeyAction maps ArrowLeft and ArrowRight to scrub actions when allowed", () => {
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "ArrowLeft", canScrub: true }), "scrub-back");
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "ArrowRight", canScrub: true }), "scrub-forward");
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "ArrowLeft", canScrub: false }), null);
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "ArrowRight", canScrub: true, altKey: true }), null);
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "ArrowLeft", canScrub: true, inEditable: true }), null);
  assert.equal(resolveTrainerKeyAction({ ...baseInput, key: "ArrowRight", canScrub: true, dialogOpen: true }), null);
});

test("DOM target helpers detect editable inputs, interactive buttons/links, and open dialogs", () => {
  const input = document.createElement("input");
  const textarea = document.createElement("textarea");
  const select = document.createElement("select");
  const editable = document.createElement("div");
  editable.setAttribute("contenteditable", "true");
  const editableChild = document.createElement("span");
  editable.appendChild(editableChild);
  const button = document.createElement("button");
  const buttonIcon = document.createElement("span");
  button.appendChild(buttonIcon);
  const link = document.createElement("a");
  link.href = "/studio";
  const plainDiv = document.createElement("div");

  assert.equal(isEditableTarget(input), true);
  assert.equal(isEditableTarget(textarea), true);
  assert.equal(isEditableTarget(select), true);
  assert.equal(isEditableTarget(editableChild), true);
  assert.equal(isEditableTarget(button), false);
  assert.equal(isEditableTarget(plainDiv), false);

  assert.equal(isInteractiveTarget(button), true);
  assert.equal(isInteractiveTarget(buttonIcon), true);
  assert.equal(isInteractiveTarget(link), true);
  assert.equal(isInteractiveTarget(plainDiv), false);

  assert.equal(hasOpenDialog(document), false);
  const picker = document.createElement("div");
  picker.setAttribute("data-promotion-open", "");
  document.body.appendChild(picker);
  assert.equal(hasOpenDialog(document), true);
  picker.remove();
  assert.equal(hasOpenDialog(document), false);
});
