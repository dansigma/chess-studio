// SIG-1187: VariationChoiceDialog visible-state tests. Store-seeded boards with
// a branching root, `variationChoice` set like forward() sets it; pins the
// option list, mainline badge, click/number/arrow+Enter selection, and
// Escape/Cancel dismissal without moving.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createEmptyTree, playMove } from "@/src/chess/tree.ts";
import type { BoardSession } from "@/src/store/slices/types.ts";

const { VariationChoiceDialog } = await import("./VariationChoiceDialog.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const MOVE_E4 = { san: "e4", uci: "e2e4", fen: "fen-e4", from: "e2", to: "e4" };
const MOVE_D4 = { san: "d4", uci: "d2d4", fen: "fen-d4", from: "d2", to: "d4" };

function seedBranchChoice(): void {
  let tree = createEmptyTree();
  let path: number[] = [];
  ({ tree, path } = playMove(tree, path, MOVE_E4));
  ({ tree } = playMove(tree, [], MOVE_D4));
  const board: BoardSession = {
    ...{
      id: "board-branch",
      remoteId: null,
      title: "Branch",
      tree,
      path: [],
      headers: {},
      orientation: "white",
      repertoireColor: null,
      dirty: false,
      preview: false,
    },
  };
  useStudioStore.setState({
    boards: [board],
    activeBoardId: board.id,
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    setupMode: false,
    training: false,
    variationChoice: { boardId: board.id, path: [] },
  });
}

before(() => {
  setupDom();
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
});

test("lists both continuations with the mainline badge on the first", () => {
  seedBranchChoice();
  try {
    render(<VariationChoiceDialog />);
    assert.ok(screen.getByRole("heading", { name: "Choose a continuation" }));
    assert.ok(screen.getByRole("button", { name: /1\. e4/ }));
    assert.ok(screen.getByRole("button", { name: /1\. d4/ }));
    assert.ok(screen.getByText("Main line"));
  } finally {
    cleanup();
  }
});

test("click selects the variation and closes the dialog", () => {
  seedBranchChoice();
  try {
    render(<VariationChoiceDialog />);
    fireEvent.click(screen.getByRole("button", { name: /1\. d4/ }));
    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [1]);
    assert.equal(state.variationChoice, null);
    assert.equal(screen.queryByRole("heading", { name: "Choose a continuation" }), null);
  } finally {
    cleanup();
  }
});

test("number key selects the matching option", () => {
  seedBranchChoice();
  try {
    const { container } = render(<VariationChoiceDialog />);
    const list = container.querySelector("[data-variation-list]");
    assert.ok(list);
    fireEvent.keyDown(list!, { key: "2" });
    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [1]);
    assert.equal(state.variationChoice, null);
  } finally {
    cleanup();
  }
});

test("ArrowDown then Enter selects the second option", () => {
  seedBranchChoice();
  try {
    const { container } = render(<VariationChoiceDialog />);
    const list = container.querySelector("[data-variation-list]");
    assert.ok(list);
    fireEvent.keyDown(list!, { key: "ArrowDown" });
    fireEvent.keyDown(list!, { key: "Enter" });
    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [1]);
    assert.equal(state.variationChoice, null);
  } finally {
    cleanup();
  }
});

test("Tab focus then Enter selects the focused option, not the arrow cursor", () => {
  seedBranchChoice();
  try {
    render(<VariationChoiceDialog />);
    // QA repro (SIG-1187): Tab moves DOM focus without touching the arrow
    // cursor, so Enter must follow the focused button, not cursorRef.
    fireEvent.focus(screen.getByRole("button", { name: /1\. d4/ }));
    fireEvent.keyDown(screen.getByRole("button", { name: /1\. d4/ }), {
      key: "Enter",
    });
    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [1]);
    assert.equal(state.variationChoice, null);
  } finally {
    cleanup();
  }
});

test("Escape cancels without moving", () => {
  seedBranchChoice();
  try {
    render(<VariationChoiceDialog />);
    fireEvent.keyDown(document, { key: "Escape" });
    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, []);
    assert.equal(state.variationChoice, null);
  } finally {
    cleanup();
  }
});

test("Cancel button closes without moving", () => {
  seedBranchChoice();
  try {
    render(<VariationChoiceDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, []);
    assert.equal(state.variationChoice, null);
  } finally {
    cleanup();
  }
});

// SIG-1190: the shaded background is the only active state, shared by keyboard
// and pointer through one activeIndex.
test("first option starts active with the shaded background", () => {
  seedBranchChoice();
  try {
    const { container } = render(<VariationChoiceDialog />);
    const options = container.querySelectorAll("button[data-option]");
    assert.equal(options.length, 2);
    assert.equal(options[0].getAttribute("data-active"), "true");
    assert.equal(options[1].getAttribute("data-active"), null);
    assert.ok(options[0].className.includes("bg-studio-hover-strong"));
    assert.ok(!options[1].className.includes("bg-studio-hover-strong"));
  } finally {
    cleanup();
  }
});

test("ArrowDown moves the single active state to the second option", () => {
  seedBranchChoice();
  try {
    const { container } = render(<VariationChoiceDialog />);
    const list = container.querySelector("[data-variation-list]");
    assert.ok(list);
    fireEvent.keyDown(list!, { key: "ArrowDown" });
    const options = container.querySelectorAll("button[data-option]");
    assert.equal(options[0].getAttribute("data-active"), null);
    assert.equal(options[1].getAttribute("data-active"), "true");
    assert.equal(container.querySelectorAll('[data-active="true"]').length, 1);
  } finally {
    cleanup();
  }
});

test("mouseEnter moves the single active state", () => {
  seedBranchChoice();
  try {
    const { container } = render(<VariationChoiceDialog />);
    const second = screen.getByRole("button", { name: /1\. d4/ });
    fireEvent.mouseEnter(second);
    const options = container.querySelectorAll("button[data-option]");
    assert.equal(options[0].getAttribute("data-active"), null);
    assert.equal(options[1].getAttribute("data-active"), "true");
    assert.equal(container.querySelectorAll('[data-active="true"]').length, 1);
  } finally {
    cleanup();
  }
});

test("Tab focus then Enter selects the focused option", () => {
  seedBranchChoice();
  try {
    render(<VariationChoiceDialog />);
    const second = screen.getByRole("button", { name: /1\. d4/ });
    fireEvent.focus(second);
    assert.equal(second.getAttribute("data-active"), "true");
    fireEvent.keyDown(second, { key: "Enter" });
    const state = useStudioStore.getState();
    assert.deepEqual(state.active().path, [1]);
    assert.equal(state.variationChoice, null);
  } finally {
    cleanup();
  }
});

test("options carry no outline accent class", () => {
  seedBranchChoice();
  try {
    const { container } = render(<VariationChoiceDialog />);
    const options = container.querySelectorAll("button[data-option]");
    for (const option of options) {
      assert.ok(!option.className.includes("outline-studio-accent"));
      assert.ok(!option.className.includes("hover:bg-studio-hover-strong"));
    }
  } finally {
    cleanup();
  }
});
