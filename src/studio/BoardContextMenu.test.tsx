import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BoardContextMenu } from "./BoardContextMenu";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const noop = () => {};
function mount(
  onSearchLibrary?: () => void,
  onClose: () => void = noop,
  moveNav?: { checked: boolean; toggle: () => void },
) {
  render(
    <BoardContextMenu
      menu={{ x: 10, y: 10 }}
      showEvalBar={false}
      showMoveNavBar={moveNav?.checked}
      showThreat={false}
      locale="en"
      onFlip={noop}
      onToggleEvalBar={noop}
      onToggleMoveNavBar={moveNav?.toggle}
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

test("move controls toggle follows the evaluation bar and reflects the setting", () => {
  let toggled = 0;
  let closed = 0;
  for (const checked of [false, true]) {
    mount(undefined, () => (closed += 1), { checked, toggle: () => (toggled += 1) });
    const item = screen.getByRole("menuitemcheckbox", {
      name: "Show move controls below the board",
      checked,
    });
    assert.equal(item.previousElementSibling, screen.getByRole("menuitemcheckbox", { name: "Show evaluation bar" }));
    fireEvent.click(item);
    cleanup();
  }
  assert.equal(toggled, 2);
  assert.equal(closed, 2);
});

test("item is omitted without a handler", () => {
  mount();
  assert.equal(screen.queryByText("Search this position in Library"), null);
});

test("SIG-1399: clamps menu inside viewport using measured dimensions and falls back to 220x340 when rect is zero", () => {
  const origWidth = window.innerWidth;
  const origHeight = window.innerHeight;
  const origGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  try {
    Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    // 1. Measured rect non-zero: 240x380 near bottom-right.
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("fixed")) {
        return {
          left: 0,
          top: 0,
          right: 240,
          bottom: 380,
          width: 240,
          height: 380,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return origGetBoundingClientRect.call(this);
    };

    const { container } = render(
      <BoardContextMenu
        menu={{ x: 950, y: 750 }}
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
        onClose={noop}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    assert.equal(root.style.left, "752px");
    assert.equal(root.style.top, "412px");

    cleanup();

    // 2. Zero rect (happy-dom default): falls back to 220x340.
    HTMLElement.prototype.getBoundingClientRect = origGetBoundingClientRect;
    const second = render(
      <BoardContextMenu
        menu={{ x: 950, y: 750 }}
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
        onClose={noop}
      />,
    );
    const secondRoot = second.container.firstElementChild as HTMLElement;
    assert.equal(secondRoot.style.left, "772px");
    assert.equal(secondRoot.style.top, "452px");
  } finally {
    HTMLElement.prototype.getBoundingClientRect = origGetBoundingClientRect;
    Object.defineProperty(window, "innerWidth", { value: origWidth, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: origHeight, configurable: true });
  }
});
