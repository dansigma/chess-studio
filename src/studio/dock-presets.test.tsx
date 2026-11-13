import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { createDockview, type DockviewApi } from "dockview-core";
import { DOCK_PRESET_SEEDS } from "./dock-api.ts";
import {
  DOCK_LAYOUT_VERSION,
  DOCK_PRESET_IDS,
  remapBoardPanels,
  sanitizeDockLayout,
  type DockLayoutSnapshot,
} from "./dock-layout.ts";

before(() => {
  setupDom();
  // dockview-core reads these DOM globals directly.
  const win = document.defaultView as unknown as Record<string, unknown>;
  for (const key of ["Node", "Element", "DocumentFragment", "Event", "MouseEvent", "KeyboardEvent", "DragEvent", "getComputedStyle"]) {
    if (!(key in globalThis) && key in win) {
      (globalThis as Record<string, unknown>)[key] = win[key];
    }
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
after(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  teardownDom();
});

function makeApi(): DockviewApi {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const api = createDockview(element, {
    createComponent: () => ({
      element: document.createElement("div"),
      init: () => {},
      dispose: () => {},
    }),
  });
  api.layout(1200, 800);
  return api;
}

// Reads the grid back as nested arrays: branches become arrays, leaves become
// "tab,tab" strings with the active tab first marked by "*".
function shape(node: unknown): unknown {
  const n = node as { type: string; data: unknown };
  if (n.type === "leaf") {
    const leaf = n.data as { views: string[]; activeView: string };
    return leaf.views.map((v) => (v === leaf.activeView ? `${v}*` : v)).join(",");
  }
  return (n.data as unknown[]).map(shape);
}

function seeded(preset: (typeof DOCK_PRESET_IDS)[number]): { api: DockviewApi; snapshot: DockLayoutSnapshot } {
  const api = makeApi();
  DOCK_PRESET_SEEDS[preset](api, "Board", "b1");
  const snapshot = sanitizeDockLayout({ version: DOCK_LAYOUT_VERSION, dock: api.toJSON() });
  assert.ok(snapshot, `${preset} survives sanitizeDockLayout`);
  return { api, snapshot };
}

test("default seed: board over analysis tabs, reading tabs over explorer + games", () => {
  const { snapshot } = seeded("full");
  const root = (snapshot.dock.grid as { root: unknown }).root;
  assert.deepEqual(shape(root), [
    ["board:b1*", "engine*,evalGraph,insights"],
    ["notation*,repertoire,review,myStats", ["explorer*", "games*"]],
  ] as unknown);
});

test("every preset seeds a layout that survives sanitize and keeps the board", () => {
  for (const id of DOCK_PRESET_IDS) {
    const { snapshot } = seeded(id);
    assert.ok("board:b1" in snapshot.dock.panels, id);
    assert.ok("engine" in snapshot.dock.panels, id);
  }
  const minimal = seeded("minimal").snapshot;
  assert.deepEqual(Object.keys(minimal.dock.panels).sort(), ["board:b1", "engine", "evalGraph"]);
  const study = seeded("study").snapshot;
  assert.deepEqual(shape((study.dock.grid as { root: unknown }).root), [
    ["board:b1*", "explorer*,games"],
    ["repertoire*,notation,review,myStats", "engine*,evalGraph,insights"],
  ] as unknown);
});

test("remapBoardPanels maps saved board ids onto the open boards, never inventing one", () => {
  const { snapshot } = seeded("full");
  const remapped = remapBoardPanels(snapshot, ["x9"]);
  assert.ok(remapped);
  assert.ok("board:x9" in remapped.dock.panels);
  assert.ok(!("board:b1" in remapped.dock.panels));
  const text = JSON.stringify(remapped);
  assert.ok(!text.includes("b1\""), "no stale board id left behind");
  assert.ok(text.includes('"boardId":"x9"'));
  // More saved boards than open ones: the surplus panel is dropped.
  const api = makeApi();
  DOCK_PRESET_SEEDS.full(api, "A", "b1");
  api.addPanel({ id: "board:b2", component: "board", title: "B", params: { boardId: "b2" }, position: { referencePanel: "board:b1" } });
  const two = sanitizeDockLayout({ version: DOCK_LAYOUT_VERSION, dock: api.toJSON() });
  assert.ok(two);
  const one = remapBoardPanels(two, ["z1"]);
  assert.ok(one);
  assert.deepEqual(
    Object.keys(one.dock.panels).filter((id) => id.startsWith("board:")),
    ["board:z1"],
  );
});
