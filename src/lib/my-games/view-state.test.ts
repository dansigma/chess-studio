// SIG-1089: truth table for the My Games sidebar body state. Pure-module
// import (`view-state.ts`) because no `node:test` suite imports a `.tsx`
// component — the state function lives dependency-free so this runs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { myGamesViewState } from "./view-state.ts";

function game(id: string): PlayerGame {
  return {
    id,
    winner: "white",
    whiteName: "Magnus",
    whiteRating: null,
    blackName: "Hikaru",
    blackRating: null,
    year: 2026,
    month: 10,
    event: null,
    eco: null,
    opening: null,
    pgn: "1. e4 e5 *",
    moves: undefined,
    timeClass: null,
    color: "white",
    playerResult: "win",
    playedAt: null,
  };
}

const base = {
  user: { id: "user-1" },
  linkedLoading: false,
  gamesLoading: false,
  linkedCount: 1,
  games: [game("game-1")],
};

describe("myGamesViewState", () => {
  it("anonymous sees the sign-in hint even while everything loads", () => {
    assert.equal(
      myGamesViewState({ ...base, user: null, linkedLoading: true, gamesLoading: true }),
      "signedOut",
    );
  });

  it("loading beats both hints so a reload never flashes them", () => {
    assert.equal(myGamesViewState({ ...base, linkedLoading: true }), "loading");
    assert.equal(
      myGamesViewState({ ...base, linkedCount: 0, games: [], gamesLoading: true }),
      "loading",
    );
  });

  it("signed-in users without linked accounts see the link hint", () => {
    assert.equal(myGamesViewState({ ...base, linkedCount: 0, games: [] }), "linkAccount");
    assert.equal(myGamesViewState({ ...base, linkedCount: 0 }), "linkAccount");
  });

  it("linked users with no games see the empty hint, otherwise the list", () => {
    assert.equal(myGamesViewState({ ...base, games: [] }), "empty");
    assert.equal(myGamesViewState(base), "list");
  });
});
