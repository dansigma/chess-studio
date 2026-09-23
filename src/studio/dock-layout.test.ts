import assert from "node:assert/strict";
import test from "node:test";
import { DOCK_LAYOUT_VERSION, sanitizeDockLayout } from "./dock-layout.ts";

const notation = { id: "notation", contentComponent: "notation", title: "Notation" };
const explorer = { id: "explorer", contentComponent: "explorer", title: "Ultra Database" };
const board = { id: "board", contentComponent: "board", title: "Board" };

test("player panels are removed and a player-only group is dropped", () => {
  const snapshot = sanitizeDockLayout({
    version: DOCK_LAYOUT_VERSION,
    dock: {
      grid: {
        root: {
          type: "branch",
          size: 600,
          data: [
            {
              type: "leaf",
              size: 400,
              data: {
                id: "g1",
                views: ["notation", "player-explorer", "player-games"],
                activeView: "player-games",
                tabGroups: [{ id: "tg", collapsed: false, panelIds: ["player-explorer", "notation"] }],
              },
            },
            {
              type: "leaf",
              size: 200,
              data: { id: "g2", views: ["player-explorer"], activeView: "player-explorer" },
            },
          ],
        },
        width: 800,
        height: 600,
        orientation: "HORIZONTAL",
      },
      panels: {
        notation,
        "player-explorer": { id: "player-explorer", contentComponent: "playerExplorer" },
        "player-games": { id: "player-games", contentComponent: "playerGames" },
      },
      activeGroup: "g2",
      floatingGroups: [
        {
          data: { id: "float-player", views: ["player-games"], activeView: "player-games" },
          position: { x: 0, y: 0, width: 100, height: 100 },
        },
      ],
    },
  });

  assert.ok(snapshot);
  const root = snapshot.dock.grid as {
    root: { type: string; data: Array<{ data: { id: string; views: string[]; activeView: string; tabGroups: Array<{ panelIds: string[] }> } }> };
  };
  assert.equal(root.root.type, "branch");
  assert.equal(root.root.data.length, 1);
  assert.deepEqual(root.root.data[0]?.data.views, ["notation"]);
  assert.equal(root.root.data[0]?.data.activeView, "notation");
  assert.deepEqual(root.root.data[0]?.data.tabGroups[0]?.panelIds, ["notation"]);
  assert.deepEqual(snapshot.dock.panels, { notation });
  assert.equal(snapshot.dock.activeGroup, "g1");
  assert.equal("floatingGroups" in snapshot.dock, false);
});

test("a closed studio panel stays closed", () => {
  const snapshot = sanitizeDockLayout({
    version: DOCK_LAYOUT_VERSION,
    dock: {
      grid: {
        root: {
          type: "branch",
          data: [
            { type: "leaf", data: { id: "g-board", views: ["board"], activeView: "board" } },
            { type: "leaf", data: { id: "g-note", views: ["notation"], activeView: "notation" } },
          ],
        },
        width: 100,
        height: 100,
        orientation: "HORIZONTAL",
      },
      panels: { board, notation },
      activeGroup: "g-note",
    },
  });

  assert.ok(snapshot);
  assert.deepEqual(Object.keys(snapshot.dock.panels), ["board", "notation"]);
  assert.equal(snapshot.dock.activeGroup, "g-note");
});

test("a single remaining group is wrapped so the root stays a branch", () => {
  const snapshot = sanitizeDockLayout({
    version: DOCK_LAYOUT_VERSION,
    dock: {
      grid: {
        root: { type: "leaf", size: 100, data: { id: "only", views: ["board"], activeView: "board" } },
        width: 100,
        height: 100,
        orientation: "HORIZONTAL",
      },
      panels: { board },
      activeGroup: "only",
    },
  });

  assert.ok(snapshot);
  const root = snapshot.dock.grid as { root: { type: string; data: unknown[] } };
  assert.equal(root.root.type, "branch");
  assert.equal(root.root.data.length, 1);
});

test("a mismatched component or a stale version is rejected", () => {
  assert.equal(
    sanitizeDockLayout({
      version: DOCK_LAYOUT_VERSION,
      dock: {
        grid: {
          root: {
            type: "branch",
            data: [{ type: "leaf", data: { id: "g", views: ["board"], activeView: "board" } }],
          },
          width: 1,
          height: 1,
          orientation: "HORIZONTAL",
        },
        panels: { board: { id: "board", contentComponent: "notation" } },
      },
    }),
    null,
  );
  assert.equal(sanitizeDockLayout({ version: "old", dock: { panels: { explorer } } }), null);
  assert.equal(sanitizeDockLayout(null), null);
});
