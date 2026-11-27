// SIG-1384: the destructive toolbar buttons sit past their own separator and
// publish the shortcut keys they answer to.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useStudioStore } from "@/src/store/studio-store";
import { NotationToolbar } from "./NotationToolbar";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

const noop = () => undefined;

function renderToolbar() {
  return render(
    <NotationToolbar
      path={[0, 1]}
      commentOpen={false}
      locale="en"
      onStart={noop}
      onBack={noop}
      onForward={noop}
      onSkipForward={noop}
      onEnd={noop}
      onFlip={noop}
      onToggleComment={noop}
      onPromote={noop}
      onMakeMainline={noop}
      onDeleteAfter={noop}
      onDeleteVariation={noop}
    />,
  );
}

test("the destructive buttons follow their own separator", () => {
  renderToolbar();

  const scissors = screen.getByRole("button", { name: "Delete after" });
  const trash = screen.getByRole("button", { name: "Delete variation" });
  const separators = screen.getAllByRole("separator");
  assert.equal(separators.length, 2, "navigation/annotations and annotations/cut groups");

  assert.equal(
    separators[1].nextElementSibling,
    scissors,
    "the cut group starts right after the last separator",
  );
  assert.equal(scissors.nextElementSibling, trash);
});

test("the destructive buttons expose their keyboard shortcuts", () => {
  renderToolbar();

  assert.equal(
    screen.getByRole("button", { name: "Delete after" }).getAttribute("aria-keyshortcuts"),
    "Delete",
  );
  assert.equal(
    screen.getByRole("button", { name: "Delete variation" }).getAttribute("aria-keyshortcuts"),
    "Control+Delete",
  );
});

test("the Add to database button opens the dialog", () => {
  useStudioStore.getState().setAddToDatabaseOpen(false);
  renderToolbar();

  const button = screen.getByRole("button", { name: "Add to database" });
  assert.equal(button.title, "Add to database");
  fireEvent.click(button);
  assert.equal(useStudioStore.getState().addToDatabaseOpen, true);
});
