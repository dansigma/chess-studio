// SIG-1385: the empty games row offers "Import games", which opens My Games
// via the same `setActivity("mygames")` the activity bar uses.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GamesPanel } from "./GamesPanel";
import { useStudioStore } from "@/src/store/studio-store";

before(() => {
  setupDom();
});

afterEach(() => {
  cleanup();
  useStudioStore.setState({ explorer: null, explorerLoading: false, activity: "boards" });
});

after(() => {
  teardownDom();
});

test("empty state offers Import games and opens the My Games sidebar", async () => {
  useStudioStore.setState({
    explorer: {
      fen: "x",
      source: "masters",
      white: 0,
      draws: 0,
      black: 0,
      opening: null,
      games: [],
      moves: [],
    } as never,
    explorerLoading: false,
    explorerError: null,
    databaseSource: "masters",
    activity: "boards",
  });
  await act(async () => {
    render(<GamesPanel />);
  });
  assert.ok(screen.getByText("No games for this position."));
  fireEvent.click(screen.getByRole("button", { name: "Import games" }));
  assert.equal(useStudioStore.getState().activity, "mygames");
});
