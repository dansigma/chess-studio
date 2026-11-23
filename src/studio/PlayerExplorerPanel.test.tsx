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

test("SIG-1455: a locked comparison panel keeps its position while the board moves", async (t) => {
  const initial = useStudioStore.getState();
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  t.mock.method(globalThis, "fetch", async () => Response.json({ games: [
    { id: "g1", moves: "e4 e5", color: "white", playerResult: "win", whiteName: "Pat", blackName: "Opp one" },
  ] }));
  const params: PlayerPanelParams = { player: player("Pat"), color: "all", result: "all" };
  const view = render(<ComparisonPlayerPanel panelId="player:a" params={params} />);
  t.after(() => {
    cleanup();
    useStudioStore.setState({ boards: initial.boards });
  });
  await view.findByText("Opp one");
  fireEvent.click(view.getByRole("button", { name: "Lock position" }));
  assert.ok(view.getByRole("button", { name: "Locked at the starting position — click to unlock" }));
  assert.equal(useStudioStore.getState().makeUciMove("e2", "e4"), true);
  await view.findByText("Opp one");
  assert.ok(view.getByRole("button", { name: /^e4/ }));
  fireEvent.click(view.getByRole("button", { name: /Locked at/ }));
  // The player's own moves only: after 1.e4 the unlocked panel has no row.
  assert.equal(view.queryByRole("button", { name: /^e4/ }), null);
});

test("a Base Xadrez Digital panel loads the lines and notes the 200 most recent games", async (t) => {
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    urls.push(input);
    return Response.json({
      total: 1234,
      games: Array.from({ length: 200 }, (_, i) => ({
        id: i, white: i === 0 ? "Lima, Lucas" : "Outro", black: "Rival", whiteElo: 2500, blackElo: 2400,
        result: "1-0", date: "2024.05.06", event: "Open", eco: "B00", moves: "e4 e5", color: "white", playerResult: "win",
      })),
    });
  });
  t.after(() => {
    useStudioStore.setState({ settings: DEFAULT_SETTINGS });
    cleanup();
  });
  const xd: PlayerHit = {
    id: "xadrez-digital:3-7", source: "xadrez-digital", username: "3-7", displayName: "Lima, Lucas", subtitle: "Base Xadrez Digital",
  };
  const view = render(<ComparisonPlayerPanel panelId="player:xd" params={{ player: xd, color: "all", result: "all" }} />);
  await view.findByText("Últimas 200 de 1.234 partidas");
  assert.deepEqual(urls, ["/api/xd-database/players/3-7/lines"]);
  assert.ok(view.getByText("Lima, Lucas"));
  assert.ok(view.getAllByText("e4").length > 0);
});
