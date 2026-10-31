// SIG-1091: source-text contract for the My Stats panel wiring.
// Mirrors `sidebar-batch.test.ts`: no `node:test` suite imports a `.tsx`
// component, so these pin the UI contract (sidebar Stats button, panel
// sections, dock registration) against the source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sidebar = readFileSync(new URL("../../studio/MyGamesSidebar.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../studio/MyStatsPanel.tsx", import.meta.url), "utf8");
const dock = readFileSync(new URL("../../studio/StudioDock.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../../studio/dock-api.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../studio/dock-layout.ts", import.meta.url), "utf8");

describe("My Stats panel contract (SIG-1091)", () => {
  it("opens from the sidebar via a localized Stats button", () => {
    assert.ok(sidebar.includes("myGames.stats"), "sidebar must label the Stats button");
    assert.ok(sidebar.includes('openStudioPanel("myStats")'), "sidebar must open the myStats panel");
  });

  it("renders the three stats sections from the stats module", () => {
    assert.ok(panel.includes("myGames.statsTrend"), "panel must render the accuracy trend heading");
    assert.ok(panel.includes("myGames.statsByOpening"), "panel must render the results-by-opening heading");
    assert.ok(panel.includes("myGames.statsByPhase"), "panel must render the mistakes-by-phase heading");
    assert.ok(panel.includes("accuracyTrend"), "panel must aggregate with accuracyTrend");
    assert.ok(panel.includes("resultsByOpening"), "panel must aggregate with resultsByOpening");
    assert.ok(panel.includes("mistakesByPhase"), "panel must aggregate with mistakesByPhase");
    assert.ok(panel.includes("myGames.statsEmpty"), "panel must show the <3-reviewed empty state");
    assert.ok(panel.includes('role="tab"'), "opening table must offer white/black tabs");
  });

  it("registers the myStats panel in the dock, sanitize set, and locale titles", () => {
    assert.ok(api.includes('"myStats"'), "dock-api must know the myStats panel id");
    assert.ok(api.includes("panels.myStats"), "STATIC_PANEL_KEYS must map myStats to its tab title");
    assert.ok(layout.includes('"myStats"'), "dock-layout STUDIO_PANELS must keep myStats across sanitize");
    assert.ok(dock.includes("MyStatsPanel"), "StudioDock must mount the panel component");
    assert.ok(dock.includes("ensureMyStatsPanel"), "StudioDock must ensure the panel on ready");
    assert.ok(dock.includes('"myStats"'), "StudioDock locale re-title must cover myStats");
  });

  it("titles the panel through the shared panels slice", () => {
    assert.ok(api.includes("myStats: \"panels.myStats\""), "STATIC_PANEL_KEYS must use the panels slice title");
    assert.ok(dock.includes('panelTitleForId(locale, "myStats")'), "locale re-title must run myStats through panelTitleForId");
  });

  it("loads my_games once per user with cancellation (SIG-1180)", () => {
    assert.ok(
      panel.includes("loadCappedMyGames"),
      "panel must page through the cancel-aware capped loader",
    );
    assert.ok(
      panel.includes("[userId]"),
      "panel effect must key on the stable user id, not the user object",
    );
    assert.ok(
      panel.includes("myStatsLoadByUser"),
      "panel must share the in-flight load across remounts",
    );
    assert.ok(
      panel.includes("isCancelled"),
      "panel must stop superseded pagination loops early",
    );
    assert.ok(
      !panel.includes("[user]"),
      "panel must not re-run the load on user object identity changes",
    );
  });
});
