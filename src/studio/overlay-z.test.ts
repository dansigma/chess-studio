import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sources: Record<string, string> = {
  dialog: readFileSync(new URL("./ui/Dialog.tsx", import.meta.url), "utf8"),
  glyphMenu: readFileSync(new URL("./NotationContextMenu.tsx", import.meta.url), "utf8"),
  contextMenu: readFileSync(new URL("./BoardContextMenu.tsx", import.meta.url), "utf8"),
  controls: readFileSync(new URL("./ui/Controls.tsx", import.meta.url), "utf8"),
  menuBar: readFileSync(new URL("./MenuBar.tsx", import.meta.url), "utf8"),
};

// SIG-912: the dockview split sash paints above Tailwind's z-50 scale, so
// app-modal studio overlays must live on tiers 1000/1100.
describe("studio overlay z tiers (SIG-912)", () => {
  it("renders app-modal overlays above the dockview sash tier", () => {
    for (const [name, source] of [
      ["Dialog", sources.dialog],
      ["NotationContextMenu", sources.glyphMenu],
      ["BoardContextMenu", sources.contextMenu],
      ["Controls tooltip", sources.controls],
    ] as const) {
      assert.ok(
        source.includes("z-[1100]"),
        `${name} should use z-[1100] so the 8px dock sash never paints over it`,
      );
    }
    assert.ok(
      sources.menuBar.includes("z-[1000]"),
      "MenuBar should use z-[1000] so File/Edit/View menus paint above the dock",
    );
  });

  it("leaves no bare z-50 on the raised overlay surfaces", () => {
    for (const [name, source] of [
      ["Dialog", sources.dialog],
      ["NotationContextMenu", sources.glyphMenu],
      ["BoardContextMenu", sources.contextMenu],
    ] as const) {
      assert.ok(
        !source.includes("z-50"),
        `${name} should not keep a bare z-50 that the sash can paint over`,
      );
    }
    // Tooltip class string lives alongside other utilities; scope the check to
    // the tooltip surface marker.
    const tooltipLine = sources.controls
      .split("\n")
      .find((line) => line.includes("group-hover/tip:flex"));
    assert.ok(tooltipLine, "expected a tooltip surface in Controls.tsx");
    assert.ok(!tooltipLine.includes("z-50"), "tooltip should not keep a bare z-50");
  });

  it("keeps MenuBar dropdowns ordered inside the raised wrapper", () => {
    assert.ok(
      sources.menuBar.includes("z-[1000]"),
      "MenuBar wrapper should establish the raised stacking context",
    );
    assert.ok(sources.menuBar.includes("z-10"), "MenuBar scrim keeps its inner order");
    assert.ok(sources.menuBar.includes("z-20"), "MenuBar dropdowns keep their inner order");
  });
});
