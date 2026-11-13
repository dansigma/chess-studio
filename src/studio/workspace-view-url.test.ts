import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_LIVE_URL_STATE,
  parseLibraryMode,
  parseLiveUrlState,
  parseWorkspaceView,
  withLibraryMode,
  withLiveUrlState,
  withWorkspaceView,
} from "./workspace-view-url.ts";

test("parseWorkspaceView reads ?view=library and defaults to studio", () => {
  assert.equal(parseWorkspaceView("?view=library"), "library");
  assert.equal(parseWorkspaceView("?fen=x&view=library"), "library");
  assert.equal(parseWorkspaceView(""), "studio");
  assert.equal(parseWorkspaceView("?view=other"), "studio");
});

test("withWorkspaceView sets and clears the parameter, keeping others", () => {
  assert.equal(withWorkspaceView("", "library"), "?view=library");
  assert.equal(withWorkspaceView("?a=1", "library"), "?a=1&view=library");
  assert.equal(withWorkspaceView("?a=1&view=library", "studio"), "?a=1");
  assert.equal(withWorkspaceView("?view=library", "studio"), "");
});

test("view=live round-trips and other values still fall back to studio", () => {
  assert.equal(parseWorkspaceView("?view=live"), "live");
  assert.equal(withWorkspaceView("", "live"), "?view=live");
  assert.equal(withWorkspaceView("?view=library", "live"), "?view=live");
  assert.equal(withWorkspaceView("?a=1&view=live", "studio"), "?a=1");
});

test("leaving view=live clears live, games and focus", () => {
  const search = "?view=live&live=r1&games=r1%3Ag1&focus=r1%3Ag1&a=1";
  assert.equal(withWorkspaceView(search, "studio"), "?a=1");
  assert.equal(withWorkspaceView(search, "library"), "?view=library&a=1");
  assert.equal(withWorkspaceView(search, "live"), search);
});

test("parseLiveUrlState reads round, games and focus", () => {
  const state = parseLiveUrlState("?view=live&live=r1&games=r1:g1,r1:g2,r2:g9&focus=r1:g2");
  assert.equal(state.round, "r1");
  assert.deepEqual(state.games, [
    { roundId: "r1", gameId: "g1" },
    { roundId: "r1", gameId: "g2" },
    { roundId: "r2", gameId: "g9" },
  ]);
  assert.deepEqual(state.focus, { roundId: "r1", gameId: "g2" });
});

test("parseLiveUrlState ignores Live params outside view=live and drops malformed refs", () => {
  assert.deepEqual(parseLiveUrlState("?live=r1&games=r1:g1"), EMPTY_LIVE_URL_STATE);
  assert.deepEqual(parseLiveUrlState("?view=library&live=r1"), EMPTY_LIVE_URL_STATE);
  const state = parseLiveUrlState("?view=live&games=bad,r1:g1,:x,r1:,r1:g1&focus=nope");
  assert.deepEqual(state.games, [{ roundId: "r1", gameId: "g1" }]);
  assert.equal(state.focus, null);
  assert.equal(state.round, null);
});

test("withLiveUrlState writes the whole scheme and round-trips through parse", () => {
  const state = {
    round: "r1",
    games: [{ roundId: "r1", gameId: "g1" }, { roundId: "r2", gameId: "g2" }],
    focus: { roundId: "r2", gameId: "g2" },
  };
  const search = withLiveUrlState("?a=1", state);
  assert.deepEqual(parseLiveUrlState(search), state);
  assert.equal(new URLSearchParams(search).get("a"), "1");
  assert.equal(withLiveUrlState("?view=library", {}), "?view=live");
  assert.equal(withLiveUrlState("?view=live&live=old", { round: "new" }), "?view=live&live=new");
});

test("Library mode (SIG-1318): players is in the URL, games is the default", () => {
  assert.equal(parseLibraryMode("?view=library&mode=players"), "players");
  assert.equal(parseLibraryMode("?view=library"), "games");
  assert.equal(parseLibraryMode("?view=library&mode=other"), "games");
  assert.equal(parseLibraryMode("?mode=players"), "games");
  assert.equal(withLibraryMode("?view=library", "players"), "?view=library&mode=players");
  assert.equal(withLibraryMode("?view=library&mode=players", "games"), "?view=library");
  assert.equal(withLibraryMode("", "players"), "");
  assert.equal(parseLibraryMode(withLibraryMode("?view=library", "players")), "players");
});

test("mode is cleared when the view leaves the library", () => {
  assert.equal(withWorkspaceView("?view=library&mode=players", "studio"), "");
  assert.equal(withWorkspaceView("?view=library&mode=players", "live"), "?view=live");
  assert.equal(withWorkspaceView("?view=library&mode=players", "library"), "?view=library&mode=players");
});
