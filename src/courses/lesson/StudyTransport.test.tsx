// SIG-1370: the "?" button opens the shortcuts dialog without a keyboard.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render } from "@testing-library/react";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { StudyTransport } = await import("./StudyTransport.tsx");

test("StudyTransport shortcuts button calls onHelp", () => {
  let opened = 0;
  const noop = () => {};
  const { getByLabelText } = render(
    <StudyTransport
      locale="en"
      atStart={false}
      canForward
      canEnd
      onStart={noop}
      onBack={noop}
      onForward={noop}
      onEnd={noop}
      onFlip={noop}
      onHelp={() => (opened += 1)}
    />,
  );
  const button = getByLabelText("Keyboard shortcuts");
  assert.equal(button.getAttribute("title"), "Keyboard shortcuts (?)");
  fireEvent.click(button);
  assert.equal(opened, 1);
});
