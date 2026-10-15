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
      globalsCss.includes("width: 20px;"),
      "close button should be compact (20px)",
    );
    assert.ok(
      globalsCss.includes("height: 20px;"),
      "close button should be compact (20px)",
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

describe("studio tab close hover-only (SIG-955)", () => {
  it("hides the close button at rest with opacity (no layout shift, stays focusable)", () => {
    assert.ok(
      globalsCss.includes("opacity: 0;"),
      "close button base rule must hide with opacity: 0",
    );
    assert.ok(
      globalsCss.includes("opacity 120ms ease"),
      "close button must fade via an opacity transition",
    );
    assert.ok(
      globalsCss.includes("pointer-events: none;"),
      "hidden close button must not intercept pointer events",
    );
  });

  it("sizes the close glyph to match the sidebar close icon", () => {
    assert.ok(
      globalsCss.includes(".dv-default-tab-action svg"),
      "close glyph sizing rule must target .dv-default-tab-action svg",
    );
    assert.ok(
      globalsCss.includes("width: 12px;"),
      "close glyph should be 12px wide",
    );
    assert.ok(
      globalsCss.includes("height: 12px;"),
      "close glyph should be 12px tall",
    );
  });

  it("reveals the close button on tab hover and keyboard focus", () => {
    assert.ok(
      globalsCss.includes(".dv-tab:hover .dv-default-tab .dv-default-tab-action"),
      "close button must reveal on tab hover",
    );
    assert.ok(
      globalsCss.includes(".dv-tab:focus-within .dv-default-tab .dv-default-tab-action") ||
        globalsCss.includes(".dv-default-tab-action:focus-visible"),
      "close button must reveal on keyboard focus",
    );
    assert.ok(
      globalsCss.includes("opacity: 1;"),
      "reveal rules must set opacity: 1",
    );
  });

  it("neutralises the upstream always-visible active-tab rule without display/visibility hacks", () => {
    assert.ok(
      globalsCss.includes(".dv-tab.dv-active-tab .dv-default-tab .dv-default-tab-action"),
      "must include an active-tab neutraliser for the close button",
    );
    assert.ok(
      globalsCss.includes("visibility: visible;"),
      "neutraliser must keep visibility: visible so the button stays in tab order",
    );
    assert.ok(
      !globalsCss.includes(".dv-default-tab-action { display: none"),
      "close button must not use display: none",
    );
    assert.ok(
      !globalsCss.includes(".dv-default-tab-action { visibility: hidden"),
      "close button must not use visibility: hidden",
    );
  });

  it("keeps the close visible on the active tab for touch devices", () => {
    assert.ok(
      globalsCss.includes("@media (hover: none)"),
      "must include a touch fallback for the close button",
    );
  });
});
