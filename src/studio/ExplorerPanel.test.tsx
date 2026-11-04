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
  useStudioStore.setState({ playerProfile: null, playerGames: [] });
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
