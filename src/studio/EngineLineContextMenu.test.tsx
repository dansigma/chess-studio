import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { clampEngineMenuPosition } from "./EngineLineContextMenu.tsx";

const source = readFileSync(new URL("./EngineLineContextMenu.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("./EnginePanel.tsx", import.meta.url), "utf8");

test("engine line menu inserts only the clicked row's variation", () => {
  // Single-element insert: the snapshot PV, never the bulk list.
  assert.ok(
    source.includes("insertEngineLines(fen, [menu.pvUci])"),
    "menu should call insertEngineLines with the snapshotted single line",
  );
  assert.ok(
    !source.includes("lines.map"),
    "menu should not reference the live lines list at insert time",
  );
});

test("engine line menu closes on outside click and Escape", () => {
  // Outside click via mousedown + contains check (same pattern as BoardContextMenu).
  assert.ok(source.includes('window.addEventListener("mousedown"'), "menu closes on mousedown");
  assert.ok(source.includes(".contains(event.target as Node)"), "outside clicks dismiss the menu");
  // Escape + autofocus-first-item flow through the shared MenuSurface.
  assert.ok(source.includes("MenuSurface"), "menu uses the shared MenuSurface");
  assert.ok(source.includes("onClose={onClose}"), "Escape close flows through MenuSurface onClose");
});

test("engine line menu closes on window blur", () => {
  assert.ok(
    source.includes('window.addEventListener("blur"'),
    "menu closes on window blur",
  );
});

test("engine line menu clamps inside the viewport", () => {
  assert.deepEqual(clampEngineMenuPosition(10, 10, 800, 600), { left: 10, top: 10 });
  assert.deepEqual(clampEngineMenuPosition(790, 590, 800, 600), { left: 580, top: 420 });
  assert.deepEqual(clampEngineMenuPosition(-50, -50, 800, 600), { left: 8, top: 8 });
});

test("engine panel right-click opens the line menu with a PV snapshot", () => {
  const contextMenus = panelSource.match(/onContextMenu/g) ?? [];
  assert.ok(
    contextMenus.length >= 2,
    `row and token both need onContextMenu handlers (found ${contextMenus.length})`,
  );
  assert.ok(panelSource.includes("event.preventDefault()"), "browser menu is suppressed");
  assert.ok(
    panelSource.includes("pvUci: [...line.pvUci]"),
    "menu snapshots the PV at open time (engine refreshes lines continuously)",
  );
  assert.ok(
    panelSource.includes("<EngineLineContextMenu"),
    "panel renders EngineLineContextMenu",
  );
});
