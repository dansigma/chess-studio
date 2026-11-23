import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { DockviewApi } from "dockview-react";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings";
import { useStudioStore } from "@/src/store/studio-store";
import type { PlayerHit } from "@/src/lib/player-types";
import { setupDom, teardownDom } from "../test-utils/dom";
import { registerStudioDock } from "./dock-api";
import { ComparisonPlayerPanel } from "./PlayerExplorerPanel";
import type { PlayerPanelParams } from "./player-panel-params";

before(() => setupDom());
after(() => teardownDom());

function player(username: string): PlayerHit {
  return { id: `lichess:${username}`, source: "lichess", username, displayName: username, subtitle: "Lichess" };
}

test("changing a comparison panel's filters affects only its own position games", async (t) => {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const name = new URL(input, "http://localhost").searchParams.get("username");
    return Response.json({ games: [
      { id: `${name}-win`, moves: "e4", color: "white", playerResult: "win", whiteName: name, blackName: `${name} win` },
      { id: `${name}-draw`, moves: "d4", color: "black", playerResult: "draw", whiteName: `${name} draw`, blackName: name },
    ] });
  });
  const panels: Record<string, PlayerPanelParams> = {
    "player:a": { player: player("First"), color: "all", result: "all" },
    "player:b": { player: player("Second"), color: "all", result: "all" },
  };
  const content = () => (
    <>
      {Object.entries(panels).map(([id, params]) => (
        <section key={id} aria-label={id}>
          <ComparisonPlayerPanel panelId={id} params={params} />
        </section>
      ))}
    </>
  );
  const view = render(content());
  registerStudioDock({
    getPanel: (id: string) => ({
      api: { updateParameters: (params: PlayerPanelParams) => {
        panels[id] = params;
        view.rerender(content());
      } },
      setTitle: () => undefined,
    }),
    toJSON: () => ({}),
  } as unknown as DockviewApi);
  t.after(() => {
    registerStudioDock(null);
    cleanup();
  });

  const first = within(view.getByRole("region", { name: "player:a" }));
  const second = within(view.getByRole("region", { name: "player:b" }));
  await first.findByText("First win");
  await second.findByText("Second draw");
  fireEvent.click(first.getByRole("button", { name: "White" }));
  fireEvent.click(second.getByRole("button", { name: "Draw" }));
  assert.ok(first.getByText("First win"));
  assert.equal(first.queryByText("First draw"), null);
  assert.ok(second.getByText("Second draw"));
  assert.equal(second.queryByText("Second win"), null);
  assert.deepEqual(Object.values(panels).map(({ color, result }) => [color, result]), [
    ["white", "all"],
    ["all", "draw"],
  ]);
});
