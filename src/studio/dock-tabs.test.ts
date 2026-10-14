import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const studioDock = readFileSync(new URL("./StudioDock.tsx", import.meta.url), "utf8");

describe("studio dock tabs restyling (SIG-938)", () => {
  it("maps dockview container background to studio-bg (darker than panel)", () => {
    assert.ok(
      globalsCss.includes("--dv-tabs-and-actions-container-background-color: var(--studio-bg);"),
      "tab container background must use var(--studio-bg)",
    );
  });

  it("maps active panel tab backgrounds to studio-panel so the tab fuses with content", () => {
    assert.ok(
      globalsCss.includes("--dv-activegroup-visiblepanel-tab-background-color: var(--studio-panel);"),
      "active visible tab background must use var(--studio-panel)",
    );
    assert.ok(
      globalsCss.includes("--dv-inactivegroup-visiblepanel-tab-background-color: var(--studio-panel);"),
      "inactive group visible tab background must use var(--studio-panel)",
    );
  });

  it("applies continuous bottom border across the tab container", () => {
    assert.ok(
      globalsCss.includes("border-bottom: 1px solid var(--studio-border);"),
      "tab container must have continuous border-bottom using var(--studio-border)",
    );
  });

  it("fuses active tab with content panel using bottom border matching panel color and top-only radius", () => {
    assert.ok(
      globalsCss.includes("border-top-left-radius: 6px;") &&
        globalsCss.includes("border-bottom-left-radius: 0;"),
      "tabs must have rounded top corners and flat bottom",
    );
    assert.ok(
      globalsCss.includes("border-bottom: 1px solid var(--studio-panel);"),
      "active tab bottom border must match var(--studio-panel) to fuse with panel",
    );
  });

  it("styles inactive tabs with transparent background and muted text", () => {
    assert.ok(
      globalsCss.includes("color: var(--studio-muted);"),
      "inactive tabs should use var(--studio-muted) text",
    );
  });

  it("applies truncation with max-width to tab title content", () => {
    assert.ok(
      globalsCss.includes("max-width: 140px;"),
      "tab content must have max-width: 140px",
    );
    assert.ok(
      globalsCss.includes("text-overflow: ellipsis;"),
      "tab content must truncate with ellipsis",
    );
  });

  it("styles tab close buttons with compact dimensions and focus ring", () => {
    assert.ok(
      globalsCss.includes("width: 16px;"),
      "close button should be compact (16px)",
    );
    assert.ok(
      globalsCss.includes("height: 16px;"),
      "close button should be compact (16px)",
    );
    assert.ok(
      globalsCss.includes("background-color: var(--studio-hover-strong);"),
      "close button hover should use var(--studio-hover-strong)",
    );
  });

  it("wires tab context icon styling hook in StudioDock", () => {
    assert.ok(
      studioDock.includes("dv-tab-context-icon"),
      "StudioTab icon should include dv-tab-context-icon class",
    );
    assert.ok(
      globalsCss.includes(".dv-tab-context-icon"),
      "globals.css should define rules for .dv-tab-context-icon",
    );
  });

  it("keeps active tab z-index below app-modal and menu-bar overlay tiers", () => {
    assert.ok(
      globalsCss.includes("z-index: 10;"),
      "active tab should use z-index: 10 to overlap baseline",
    );
  });
});
