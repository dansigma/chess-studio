import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useStudioStore } from "../store/studio-store.ts";
import { BoardContextMenu } from "./BoardContextMenu";
import { ViewMenuItems } from "./MenuBarViewMenu";
import { takePendingDockLayout } from "./dock-layout.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  useStudioStore.setState({ savedLayouts: [], currentLayoutKey: null, layoutDialog: null });
});

const noop = () => {};

function mountView(locale: "en" | "pt-br" = "en") {
  useStudioStore.setState({ settings: { ...useStudioStore.getState().settings, locale } });
  function Harness() {
    return (
      <ViewMenuItems
        viewSub="layouts"
        setViewSub={noop}
        leaveSubmenu={noop}
        onOpenSettings={noop}
        run={(action) => action}
      />
    );
  }
  render(<Harness />);
}

test("View menu has a Layouts submenu with presets, saved layouts, save and manage", () => {
  useStudioStore.setState({
    savedLayouts: [{ id: "s1", name: "My saved", updatedAt: "2026-11-13T00:00:00Z", snapshot: {} as never }],
    currentLayoutKey: "preset:full",
  });
  mountView();
  assert.ok(screen.getByText("Layouts"));
  assert.equal(screen.getByText("Full analysis").closest("button")?.getAttribute("aria-checked"), "true");
  assert.ok(screen.getByText("Study / Repertoire"));
  assert.ok(screen.getByText("Engine / Minimal"));
  assert.ok(screen.getByText("My saved"));
  fireEvent.click(screen.getByText("Engine / Minimal"));
  assert.deepEqual(takePendingDockLayout(), { kind: "preset", id: "minimal" });
  fireEvent.click(screen.getByText("Save current layout…"));
  assert.equal(useStudioStore.getState().layoutDialog, "save");
  fireEvent.click(screen.getByText("Manage layouts…"));
  assert.equal(useStudioStore.getState().layoutDialog, "manage");
});

test("Layouts strings are localized in pt-BR", () => {
  mountView("pt-br");
  assert.ok(screen.getByText("Layouts"));
  assert.ok(screen.getByText("Salvar layout atual…"));
  assert.ok(screen.getByText("Gerenciar layouts…"));
  useStudioStore.setState({ settings: { ...useStudioStore.getState().settings, locale: "en" } });
});

test("board context menu offers the same Layouts options", () => {
  let closed = 0;
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
      onClose={() => (closed += 1)}
    />,
  );
  assert.equal(screen.queryByText("Save current layout…"), null, "submenu starts closed");
  fireEvent.click(screen.getByText("Layouts"));
  fireEvent.click(screen.getByText("Save current layout…"));
  assert.equal(useStudioStore.getState().layoutDialog, "save");
  assert.equal(closed, 1);
});

test("SIG-1399: LayoutsSubmenu flips left and anchors upward when near the bottom-right edge", () => {
  const origWidth = window.innerWidth;
  const origHeight = window.innerHeight;
  const origGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  try {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("relative") && this.querySelector('[aria-haspopup="true"]')) {
        return {
          left: 970,
          top: 700,
          right: 1180,
          bottom: 728,
          width: 210,
          height: 28,
          x: 970,
          y: 700,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this.getAttribute("role") === "menu" && this.classList.contains("absolute")) {
        return {
          left: 0,
          top: 0,
          right: 210,
          bottom: 260,
          width: 210,
          height: 260,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return origGetBoundingClientRect.call(this);
    };

    render(
      <BoardContextMenu
        menu={{ x: 1100, y: 720 }}
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

    fireEvent.click(screen.getByText("Layouts"));
    const submenu = screen.getByText("Save current layout…").closest('[role="menu"]');
    assert.ok(submenu, "submenu rendered");
    assert.match(submenu!.className, /\bright-full\b/, "flipped horizontally to right-full");
    assert.match(submenu!.className, /\bmr-1\.5\b/, "uses mr-1.5 when flipped left");
    assert.doesNotMatch(submenu!.className, /\bleft-full\b/, "no left-full when flipped");
    assert.match(submenu!.className, /\bbottom-\[-5px\]/, "anchored upward with bottom-[-5px]");

    cleanup();

    // When bottom-[-5px] would exceed the bottom margin, clamp top explicitly.
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("relative") && this.querySelector('[aria-haspopup="true"]')) {
        return {
          left: 970,
          top: 765,
          right: 1180,
          bottom: 793,
          width: 210,
          height: 28,
          x: 970,
          y: 765,
          toJSON: () => ({}),
        } as DOMRect;
      }
      if (this.getAttribute("role") === "menu" && this.classList.contains("absolute")) {
        return {
          left: 0,
          top: 0,
          right: 210,
          bottom: 260,
          width: 210,
          height: 260,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return origGetBoundingClientRect.call(this);
    };

    render(
      <BoardContextMenu
        menu={{ x: 1100, y: 765 }}
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
    fireEvent.click(screen.getByText("Layouts"));
    const clampedSubmenu = screen.getByText("Save current layout…").closest('[role="menu"]') as HTMLElement;
    assert.ok(clampedSubmenu, "clamped submenu rendered");
    // 800 - 8 - 260 = 532; offset from trigger top (765) = -233px
    assert.equal(clampedSubmenu.style.top, "-233px");
  } finally {
    HTMLElement.prototype.getBoundingClientRect = origGetBoundingClientRect;
    Object.defineProperty(window, "innerWidth", { value: origWidth, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: origHeight, configurable: true });
  }
});
