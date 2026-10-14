import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sources = {
  sidebar: readFileSync(new URL("./ui/Sidebar.tsx", import.meta.url), "utf8"),
  resizeHandle: readFileSync(new URL("./ui/ResizeHandle.tsx", import.meta.url), "utf8"),
  studioShell: readFileSync(new URL("./StudioShell.tsx", import.meta.url), "utf8"),
};

describe("Studio sidebar resize (SIG-953)", () => {
  it("SidebarPanel uses --sidebar-width CSS variable with fallback to 256px", () => {
    assert.ok(
      sources.sidebar.includes('var(--sidebar-width, 256px)'),
      "SidebarPanel should size using var(--sidebar-width, 256px)",
    );
    assert.ok(
      !sources.sidebar.includes("w-64"),
      "SidebarPanel should not keep a hardcoded w-64 class",
    );
  });

  it("StudioShell connects sidebarWidth, setSidebarWidth and ResizeHandle", () => {
    assert.ok(
      sources.studioShell.includes("state.settings.sidebarWidth"),
      "StudioShell should read sidebarWidth from settings",
    );
    assert.ok(
      sources.studioShell.includes("state.setSidebarWidth"),
      "StudioShell should read setSidebarWidth action",
    );
    assert.ok(
      sources.studioShell.includes("<ResizeHandle"),
      "StudioShell should render ResizeHandle component",
    );
    assert.ok(
      sources.studioShell.includes('"--sidebar-width"'),
      "StudioShell should pass --sidebar-width style variable",
    );
  });

  it("ResizeHandle implements required accessibility, pointer capture, and keyboard controls", () => {
    assert.ok(
      sources.resizeHandle.includes('role="separator"'),
      "ResizeHandle must have role='separator'",
    );
    assert.ok(
      sources.resizeHandle.includes('aria-orientation="vertical"'),
      "ResizeHandle must declare vertical orientation",
    );
    assert.ok(
      sources.resizeHandle.includes("aria-valuenow"),
      "ResizeHandle must report aria-valuenow",
    );
    assert.ok(
      sources.resizeHandle.includes("aria-valuemin"),
      "ResizeHandle must report aria-valuemin",
    );
    assert.ok(
      sources.resizeHandle.includes("setPointerCapture"),
      "ResizeHandle must capture pointer during drag",
    );
    assert.ok(
      sources.resizeHandle.includes("releasePointerCapture"),
      "ResizeHandle must release pointer capture on up/cancel",
    );
    assert.ok(
      sources.resizeHandle.includes("ArrowLeft") && sources.resizeHandle.includes("ArrowRight"),
      "ResizeHandle must handle ArrowLeft and ArrowRight keyboard navigation",
    );
    assert.ok(
      sources.resizeHandle.includes("onDoubleClick"),
      "ResizeHandle must handle double-click to reset width",
    );
  });
});
