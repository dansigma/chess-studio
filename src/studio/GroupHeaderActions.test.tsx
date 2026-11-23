import assert from "node:assert/strict";
import { after, afterEach, before, mock, test } from "node:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { IDockviewHeaderActionsProps } from "dockview-core";
import { setupDom, teardownDom } from "../test-utils/dom";
import { useStudioStore } from "../store/studio-store";
import { GroupHeaderActions } from "./GroupHeaderActions";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

function headerProps(panelId: string) {
  const panel = { id: panelId };
  let maximized = false;
  let onChange: (() => void) | undefined;
  const dispose = mock.fn();
  const maximizeGroup = mock.fn(() => {
    maximized = true;
    onChange?.();
  });
  const exitMaximizedGroup = mock.fn(() => {
    maximized = false;
    onChange?.();
  });
  const props = {
    api: { isMaximized: () => maximized },
    containerApi: {
      onDidMaximizedGroupChange: (listener: () => void) => {
        onChange = listener;
        return { dispose };
      },
      maximizeGroup,
      exitMaximizedGroup,
    },
    panels: [panel],
    activePanel: panel,
  } as unknown as IDockviewHeaderActionsProps;
  return { props, panel, maximizeGroup, exitMaximizedGroup, dispose };
}

test("a non-board group toggles between maximize and restore", () => {
  const { props, panel, maximizeGroup, exitMaximizedGroup, dispose } = headerProps("notation");
  const { getByRole, queryByRole, unmount } = render(<GroupHeaderActions {...props} />);

  assert.equal(queryByRole("button", { name: "New board" }), null);
  const maximize = getByRole("button", { name: "Maximize" });
  assert.equal(maximize.title, "Maximize");
  fireEvent.click(maximize);
  assert.deepEqual(maximizeGroup.mock.calls[0]?.arguments, [panel]);

  const restore = getByRole("button", { name: "Restore" });
  assert.equal(restore.title, "Restore");
  fireEvent.click(restore);
  assert.equal(exitMaximizedGroup.mock.callCount(), 1);
  assert.ok(getByRole("button", { name: "Maximize" }));
  unmount();
  assert.equal(dispose.mock.callCount(), 1);
});

test("the board group keeps its add button alongside the localized toggle", () => {
  const { props } = headerProps("board:b1");
  const { settings } = useStudioStore.getState();
  useStudioStore.setState({ settings: { ...settings, locale: "pt-br" } });
  try {
    const { getByRole } = render(<GroupHeaderActions {...props} />);
    assert.ok(getByRole("button", { name: "Novo tabuleiro" }));
    fireEvent.click(getByRole("button", { name: "Maximizar" }));
    assert.ok(getByRole("button", { name: "Restaurar" }));
  } finally {
    cleanup();
    useStudioStore.setState({ settings });
  }
});
