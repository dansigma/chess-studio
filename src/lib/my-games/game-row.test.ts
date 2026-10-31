// SIG-1088: unit tests for the my_games row mapper.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { playerGameToRow } from "./game-row.ts";

function baseGame(overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id: "abc123",
    winner: "white",
    whiteName: "Magnus",
    whiteRating: 2800,
    blackName: "Hikaru",
    blackRating: 2790,
    year: 2026,
    month: 10,
    event: "Lichess",
    eco: "C50",
    opening: "Italian Game",
    pgn: '[White "Magnus"]\n\n1. e4 e5 *',
    moves: "e4 e5",
    timeClass: "blitz",
    // SIG-1048: rated flag survives the row mapping.
    rated: true,
    color: "white",
    playerResult: "win",
    playedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("playerGameToRow", () => {
  it("maps a full game to a my_games insert row", () => {
    const row = playerGameToRow("user-1", "lichess", baseGame());
    assert.deepEqual(row, {
      user_id: "user-1",
      source: "lichess",
      external_id: "abc123",
      played_at: new Date(1_700_000_000_000).toISOString(),
      color: "white",
      result: "win",
      time_class: "blitz",
      white: "Magnus",
      black: "Hikaru",
      white_elo: 2800,
      black_elo: 2790,
      eco: "C50",
      opening: "Italian Game",
      ply_count: 2,
      pgn: '[White "Magnus"]\n\n1. e4 e5 *',
      rated: true,
    });
  });

  it("maps null playedAt, ratings and opening to null with zero ply", () => {
    const row = playerGameToRow(
      "user-1",
      "chesscom",
      baseGame({ playedAt: null, whiteRating: null, blackRating: null, opening: null, moves: undefined, rated: undefined }),
    );
    assert.equal(row?.played_at, null);
    assert.equal(row?.white_elo, null);
    assert.equal(row?.opening, null);
    assert.equal(row?.ply_count, 0);
    assert.equal(row?.rated, null);
  });

  it("returns null for missing id, pgn or user", () => {
    assert.equal(playerGameToRow("user-1", "lichess", baseGame({ id: "" })), null);
    assert.equal(playerGameToRow("user-1", "lichess", baseGame({ pgn: undefined })), null);
    assert.equal(playerGameToRow("user-1", "lichess", baseGame({ pgn: "   " })), null);
    assert.equal(playerGameToRow("", "lichess", baseGame()), null);
  });

  it("truncates oversize pgn to the 1 MB byte cap", () => {
    const big = `1. ${"e4 ".repeat(400_000)}*`;
    const row = playerGameToRow("user-1", "lichess", baseGame({ pgn: big }));
    assert.ok(row, "row must survive truncation");
    assert.ok(new TextEncoder().encode(row?.pgn ?? "").length <= 1_000_000, "pgn within byte cap");
  });

  it("truncates multibyte pgn without exceeding the byte cap", () => {
    const big = `${"é".repeat(600_000)} 1. e4 *`;
    const row = playerGameToRow("user-1", "lichess", baseGame({ pgn: big }));
    assert.ok(row, "row must survive truncation");
    assert.ok(new TextEncoder().encode(row?.pgn ?? "").length <= 1_000_000, "multibyte pgn within byte cap");
  });
});
