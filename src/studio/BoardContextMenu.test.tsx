import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BoardContextMenu } from "./BoardContextMenu";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const noop = () => {};
function mount(onSearchLibrary?: () => void, onClose: () => void = noop) {
  render(
    <BoardContextMenu
      menu={{ x: 10, y: 10 }}
      showEvalBar={false}
      showThreat={false}
      locale="en"
      onFlip={noop}
      onToggleEvalBar={noop}
      onToggleThreat={noop}
      onMarkWhite={noop}
      onMarkBlack={noop}
      onClearMark={noop}
      onCopyFen={noop}
      onCopyImage={noop}
      onSearchLibrary={onSearchLibrary}
      onClose={onClose}
    />,
  );
}

test("menu item searches the position in the Library and closes the menu", () => {
  let searched = 0;
  let closed = 0;
  mount(() => (searched += 1), () => (closed += 1));
  fireEvent.click(screen.getByText("Search this position in Library"));
  assert.equal(searched, 1);
  assert.equal(closed, 1);
});

test("item is omitted without a handler", () => {
  mount();
  assert.equal(screen.queryByText("Search this position in Library"), null);
});
