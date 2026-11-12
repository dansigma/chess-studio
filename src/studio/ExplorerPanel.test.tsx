// SIG-1211: the Chess.com explorer source indexes only the loaded Chess.com
// player's games. With none loaded it explains why the list is empty, and once
// a player is loaded the source selector names them.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ExplorerPanel } from "./ExplorerPanel";
import { useStudioStore } from "@/src/store/studio-store";

before(() => {
  setupDom();
});

afterEach(() => {
  cleanup();
  useStudioStore.setState({ playerProfile: null, playerGames: [], explorer: null });
});

after(() => {
  teardownDom();
});

test("chesscom source with no player loaded explains the empty list", async () => {
  useStudioStore.setState({ playerProfile: null, playerGames: [], databaseSource: "chesscom" });
  await act(async () => {
    render(<ExplorerPanel />);
  });
  assert.ok(screen.getByText(/Search for a Chess\.com player/));
  const option = screen.getByRole("option", { name: "Chess.com" });
  assert.ok(option);
});

test("chesscom source names the loaded player and drops the hint", async () => {
  useStudioStore.setState({
    playerProfile: {
      id: "chesscom:hikaru",
      source: "chesscom",
      username: "hikaru",
      displayName: "GM Hikaru Nakamura",
      subtitle: "Chess.com · hikaru",
    },
    playerGames: [],
    databaseSource: "chesscom",
  });
  await act(async () => {
    render(<ExplorerPanel />);
  });
  assert.ok(screen.getByRole("option", { name: "Chess.com · hikaru" }));
  assert.equal(screen.queryByText(/Search for a Chess\.com player/), null);
  assert.ok(screen.getByText("No games for this position."));
});

test("SIG-1299: Total row shares the rows' grid, scroller and cell structure", async () => {
  useStudioStore.setState({ playerProfile: null, playerGames: [], databaseSource: "masters" });
  const payload = {
    source: "masters",
    fen: "x",
    white: 60,
    draws: 20,
    black: 20,
    opening: null,
    games: [],
    moves: [
      { san: "e4", uci: "e2e4", games: 70, white: 40, draws: 15, black: 15, averageRating: null },
      { san: "d4", uci: "d2d4", games: 30, white: 20, draws: 5, black: 5, averageRating: null },
    ],
  };
  useStudioStore.setState({ explorer: payload as never, explorerLoading: false, explorerError: null });
  await act(async () => {
    render(<ExplorerPanel />);
  });
  const total = screen.getByTestId("explorer-total-row");
  const rows = Array.from(total.parentElement!.querySelectorAll("button[title]"));
  assert.ok(rows.length > 0);
  const row = rows[0] as HTMLElement;
  const gridClass = (el: Element) => el.className.split(/\s+/).filter((c) => c.startsWith("grid") || c.startsWith("gap-") || c.startsWith("px-") || c === "items-center").sort().join(" ");
  assert.equal(gridClass(total), gridClass(row));
  assert.match(total.className, /\bgrid-cols-\[64px_minmax\(0,1fr\)_minmax\(170px,220px\)\]/);
  // Same scroll container as the rows.
  assert.equal(total.parentElement, row.parentElement);
  assert.match(total.parentElement!.className, /overflow-auto/);
  assert.match(total.className, /sticky/);
  assert.match(total.className, /bg-studio-panel/);
  // Count cell: same width/shrink/alignment; bar wrapped in <span class="relative">.
  const rowCount = row.children[2]!.children[0] as HTMLElement;
  const totalCount = total.children[1]!.children[0] as HTMLElement;
  for (const cls of ["w-11", "shrink-0", "text-right", "tabular-nums"]) {
    assert.ok(rowCount.className.includes(cls) && totalCount.className.includes(cls), cls);
  }
  const rowBar = row.children[row.children.length - 1] as HTMLElement;
  const totalBar = total.children[2] as HTMLElement;
  assert.equal(totalBar.tagName, rowBar.tagName);
  assert.equal(totalBar.className, rowBar.className);
});
