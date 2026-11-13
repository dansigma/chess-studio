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
