// SIG-1291: clocks tick only for the side to move of an ongoing game, from clockMs − thinkTime.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LiveGame } from "@/src/lib/live/types";
import { displayClockMs, formatDisplayClock, sideToMove, tickingSide } from "./live-clock";

const W = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"; // black to move
const player = (clockMs: number | null) => ({ name: "P", title: null, rating: null, fed: null, fideId: null, clockMs });
function game(over: Partial<LiveGame> = {}): LiveGame {
  return {
    id: "g", roundId: "r", white: player(600_000), black: player(500_000), fen: W, lastMoveUci: "e2e4",
    result: "*", thinkTimeSec: null, pgn: null, updatedAt: 1_000, ...over,
  };
}

describe("live clocks", () => {
  it("side to move comes from the FEN", () => {
    assert.equal(sideToMove(W), "black");
    assert.equal(sideToMove(W.replace(" b ", " w ")), "white");
    assert.equal(sideToMove(""), null);
  });

  it("only the side to move of an ongoing game ticks", () => {
    assert.equal(tickingSide(game()), "black");
    assert.equal(tickingSide(game({ result: "1-0" })), null);
    assert.equal(tickingSide(game({ black: player(null) })), null);
    assert.equal(displayClockMs(game(), "white", 9_000), 600_000);
    assert.equal(displayClockMs(game({ result: "0-1" }), "black", 9_000), 500_000);
  });

  it("counts down from clockMs minus thinkTime and the time since the update, never below 0", () => {
    assert.equal(displayClockMs(game(), "black", 4_000), 497_000);
    assert.equal(displayClockMs(game({ thinkTimeSec: 10 }), "black", 4_000), 487_000);
    assert.equal(displayClockMs(game({ black: player(2_000) }), "black", 60_000), 0);
    assert.equal(displayClockMs(game(), "black", 0), 500_000); // clock skew: never counts up
  });

  it("a missing clock is null", () => {
    assert.equal(displayClockMs(game({ white: player(null) }), "white", 5_000), null);
  });

  it("formats whole seconds, rounding up", () => {
    assert.equal(formatDisplayClock(5_025_300), "1:23:46");
    assert.equal(formatDisplayClock(0), "0:00:00");
    assert.equal(formatDisplayClock(999), "0:00:01");
  });
});
