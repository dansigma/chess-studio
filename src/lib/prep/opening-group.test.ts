// SIG-1338: opening group keys for the Library player dossier.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { openingGroupKey } from "./opening-group.ts";

function game(overrides: Partial<PlayerGame>): PlayerGame {
  return {
    id: "g1",
    winner: null,
    whiteName: "A",
    whiteRating: null,
    blackName: "B",
    blackRating: null,
    year: 2024,
    month: 1,
    event: null,
    eco: null,
    opening: null,
    color: "white",
    playerResult: null,
    playedAt: null,
    ...overrides,
  };
}

describe("openingGroupKey", () => {
  it("normalises the opening name like resultsByOpening", () => {
    assert.equal(openingGroupKey(game({ opening: "  Italian   Game " })), "italian game");
    assert.equal(openingGroupKey(game({ opening: "Sicilian Defense\tNajdorf" })), "sicilian defense najdorf");
  });

  it("prefers the opening name over ECO and moves", () => {
    assert.equal(
      openingGroupKey(game({ opening: "French Defense", eco: "C00", moves: "e4 e6" })),
      "french defense",
    );
  });

  it("falls back to the upper-cased ECO code when the opening is blank", () => {
    assert.equal(openingGroupKey(game({ opening: "   ", eco: " c65 " })), "C65");
    assert.equal(openingGroupKey(game({ opening: null, eco: "b12", moves: "e4 c6" })), "B12");
  });

  it("falls back to the first two plies when opening and ECO are blank", () => {
    assert.equal(openingGroupKey(game({ opening: " ", eco: "", moves: "e4 e5 Nf3 Nc6" })), "e4 e5");
    assert.equal(openingGroupKey(game({ opening: null, eco: null, moves: "  d4   d5 " })), "d4 d5");
  });

  it("returns an empty key when nothing identifies the opening", () => {
    assert.equal(openingGroupKey(game({ opening: null, eco: null, moves: undefined })), "");
    assert.equal(openingGroupKey(game({ opening: "", eco: "", moves: "   " })), "");
  });
});
