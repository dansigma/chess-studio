import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { PositionInsightsPanel } = await import("./PositionInsightsPanel.tsx");
const { useStudioStore } = await import("@/src/store/studio-store");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings");
const { importPgn } = await import("@/src/chess/pgn");
const { getFenAt } = await import("@/src/chess/tree");

const store = () => useStudioStore.getState();

function seedGame() {
  const imported = importPgn(`[Event "Insights"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 *`);
  useStudioStore.setState({
    boards: [
      {
        id: "insights-board",
        remoteId: null,
        title: imported.title,
        tree: imported.tree,
        path: [0, 0, 0, 0, 0], // after 3. Bc4 (Qxf7# threat exists)
        headers: imported.headers,
        orientation: "white",
        repertoireColor: null,
        dirty: false,
        preview: false,
      },
    ],
    activeBoardId: "insights-board",
    settings: { ...DEFAULT_SETTINGS, locale: "en" },
    setupMode: false,
    insightMarks: null,
    enginePreview: null,
  });
}

beforeEach(() => seedGame());

test("follows site locale from the store and updates immediately on change", () => {
  render(<PositionInsightsPanel />);
  assert.ok(screen.getByRole("tab", { name: "Pieces" }));
  assert.ok(screen.getByRole("tab", { name: "Threats" }));
  assert.ok(screen.getByRole("tab", { name: "Concepts" }));

  act(() => {
    store().setLocale("pt-br");
  });
  assert.ok(screen.getByRole("tab", { name: "Peças" }));
  assert.ok(screen.getByRole("tab", { name: "Ameaças" }));
  assert.ok(screen.getByRole("tab", { name: "Conceitos" }));
});

test("click-to-pin survives mouseleave, hover previews temporarily, and second click unpins at once", () => {
  render(<PositionInsightsPanel />);
  const buttons = document.querySelectorAll('[role="tabpanel"] button');
  assert.ok(buttons.length >= 2);
  const first = buttons[0] as HTMLButtonElement;
  const second = buttons[1] as HTMLButtonElement;
  const tabpanel = screen.getByRole("tabpanel");

  // Click pins the first row and sets insightMarks.
  fireEvent.mouseEnter(first);
  fireEvent.click(first);
  assert.equal(first.getAttribute("aria-pressed"), "true");
  const pinnedMarks = store().insightMarks;
  assert.ok(pinnedMarks);

  // Moving the pointer out keeps the pin and marks.
  fireEvent.mouseLeave(first);
  fireEvent.mouseLeave(tabpanel);
  assert.equal(first.getAttribute("aria-pressed"), "true");
  assert.deepEqual(store().insightMarks, pinnedMarks);

  // Hovering another row previews it temporarily; leaving restores the pinned marks.
  fireEvent.mouseEnter(second);
  assert.notDeepEqual(store().insightMarks, pinnedMarks);
  fireEvent.mouseLeave(second);
  assert.deepEqual(store().insightMarks, pinnedMarks);

  // Clicking the pinned row again unpins and clears marks immediately without mouseleave.
  fireEvent.mouseEnter(first);
  fireEvent.click(first);
  assert.equal(first.getAttribute("aria-pressed"), "false");
  assert.equal(store().insightMarks, null);
});

test("pin clears on fen change, tab switch, before/after toggle, and setupMode", () => {
  render(<PositionInsightsPanel />);
  const firstPiece = document.querySelector('[role="tabpanel"] button') as HTMLButtonElement;
  fireEvent.click(firstPiece);
  assert.equal(firstPiece.getAttribute("aria-pressed"), "true");
  assert.ok(store().insightMarks);

  // Tab switch clears the pin.
  fireEvent.click(screen.getByRole("tab", { name: "Concepts" }));
  fireEvent.click(screen.getByRole("tab", { name: "Pieces" }));
  assert.equal(
    (document.querySelector('[role="tabpanel"] button') as HTMLButtonElement).getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(store().insightMarks, null);

  // Re-pin then change FEN via board path.
  fireEvent.click(document.querySelector('[role="tabpanel"] button') as HTMLButtonElement);
  assert.ok(store().insightMarks);
  const nextPath = [0, 0, 0, 0, 0, 0];
  const nextFen = getFenAt(store().active().tree, nextPath);
  act(() => {
    store().goPath(nextPath);
  });
  assert.equal(
    (document.querySelector('[role="tabpanel"] button') as HTMLButtonElement).getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(store().insightMarks, null);

  // Before/after toggle on Threats tab clears the pin.
  fireEvent.click(screen.getByRole("tab", { name: "Threats" }));
  fireEvent.click(screen.getByRole("button", { name: "Before move" }));
  const threatRow = document.querySelector('[role="tabpanel"] ul button') as HTMLButtonElement;
  assert.ok(threatRow);
  fireEvent.click(threatRow);
  assert.equal(threatRow.getAttribute("aria-pressed"), "true");
  fireEvent.click(screen.getByRole("button", { name: "After move" }));
  fireEvent.click(screen.getByRole("button", { name: "Before move" }));
  const afterToggleRow = document.querySelector('[role="tabpanel"] ul button') as HTMLButtonElement;
  assert.equal(afterToggleRow.getAttribute("aria-pressed"), "false");

  // setupMode clears pin and marks.
  fireEvent.click(screen.getByRole("tab", { name: "Pieces" }));
  fireEvent.click(document.querySelector('[role="tabpanel"] button') as HTMLButtonElement);
  assert.equal(store().insightMarks?.fen, nextFen);
  act(() => {
    store().setSetupMode(true);
  });
  assert.equal(store().insightMarks, null);
  act(() => {
    store().setSetupMode(false);
  });
  assert.equal(
    (document.querySelector('[role="tabpanel"] button') as HTMLButtonElement).getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(store().insightMarks, null);
});
