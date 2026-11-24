import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { computePositionFacts, computeThreatsToMove } from "../../chess/facts/index";
import { START_FEN } from "../../chess/tree";
import type { ExplorerGameRow, ExplorerResponse } from "../explorer-types";
import { buildPositionPack, POSITION_PACK_BYTES } from "./position-pack";

const pinnedFen = "r1bqkbnr/ppp2ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
const xdGame: ExplorerGameRow = {
  id: "95", whiteName: "José", blackName: "Marie", whiteRating: 2450, blackRating: 2380,
  year: 2019, month: 3, winner: "draw", event: "Open", eco: null, opening: null,
  pgn: "PGN should never be included",
};

function explorer(fen: string, source: "lichess" | "xadrez-digital"): ExplorerResponse {
  return {
    fen, source, opening: null, games: [], white: 4, draws: 2, black: 4,
    moves: new Chess(fen).moves({ verbose: true }).map((move, i) => ({
      uci: move.lan, san: move.lan, games: 10 * (i + 1), white: 4 * (i + 1),
      draws: 2 * (i + 1), black: 4 * (i + 1), averageRating: null,
    })),
  };
}

test("packs verified facts, White engine evaluations, SAN and source outcomes", () => {
  const facts = computePositionFacts(pinnedFen);
  const lichess = explorer(pinnedFen, "lichess");
  const pack = buildPositionPack({
    fen: pinnedFen, sanLine: ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    opening: { eco: "C60", name: "Ruy Lopez" }, facts,
    threats: [computeThreatsToMove(pinnedFen)],
    engineLines: [
      { pvSan: ["a6", "Ba4"], pvUci: ["a7a6", "b5a4"], scoreCp: -40, mate: null, depth: 18, bound: null, multipv: 1 },
      { pvSan: ["Nf6"], pvUci: ["g8f6"], scoreCp: null, mate: -3, depth: 18, bound: null, multipv: 2 },
    ],
    lichess, xd: explorer(pinnedFen, "xadrez-digital"), xdGames: Array(10).fill(xdGame),
  });
  assert.equal(pack.fen, pinnedFen);
  assert.equal(pack.moves.at(-1), "Bb5");
  assert.equal(pack.opening?.name, "Ruy Lopez");
  // In this position the bishop pins the knight to the king.
  assert.deepEqual(pack.facts?.pins.find((pin) => pin.piece === "Nc6"),
    { kind: "absolute", piece: "Nc6", by: "Bb5", to: "Ke8" });
  assert.deepEqual(pack.engine, [{ san: ["a6", "Ba4"], eval: "+0.40" }, { san: ["Nf6"], eval: "#3" }]);
  const best = new Chess(pinnedFen).moves({ verbose: true }).at(-1)!;
  assert.deepEqual(pack.lichess?.[0], {
    san: best.san, games: lichess.moves.at(-1)?.games, whitePct: 40, drawPct: 20, blackPct: 40,
  });
  assert.deepEqual(pack.xd, pack.lichess);
  assert.equal(pack.xdGames?.length, 8);
  assert.deepEqual(pack.xdGames?.[0], {
    id: "95", white: "José", black: "Marie", whiteRating: 2450, blackRating: 2380,
    year: 2019, result: "1/2-1/2", event: "Open",
  });
});

test("trims games before explorer rows, then trims fact detail without mutating input", () => {
  const lichess = explorer(START_FEN, "lichess");
  const xd = explorer(START_FEN, "xadrez-digital");
  const facts = computePositionFacts(START_FEN);
  const weakSquares: typeof facts.weakSquares = Array.from({ length: 600 }, () => ({ square: "e4", side: "w" }));
  const input = { fen: START_FEN, sanLine: [], lichess, xd, xdGames: Array(8).fill({ ...xdGame, event: "é".repeat(1100) }) };

  const gamesTrimmed = buildPositionPack(input);
  assert.ok(gamesTrimmed.xdGames!.length < 8);
  assert.equal(gamesTrimmed.lichess?.length, 20);
  assert.equal(gamesTrimmed.xd?.length, 20);

  const packed = buildPositionPack({ ...input, facts: { ...facts, weakSquares } });
  assert.equal(packed.xdGames?.length, 0);
  assert.equal(packed.lichess?.length, 6);
  assert.equal(packed.xd?.length, 6);
  assert.ok(packed.facts!.weakSquares.length < 600);
  assert.equal(weakSquares.length, 600);
  assert.ok(new TextEncoder().encode(JSON.stringify(packed)).length <= POSITION_PACK_BYTES);
});

test("serializes only the position and history when sources are absent", () => {
  const pack = buildPositionPack({ fen: START_FEN, sanLine: [], opening: null, engineLines: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(pack)), { fen: START_FEN, moves: [] });
});
