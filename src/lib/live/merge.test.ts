import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fenPly, mergeSnapshotGame, mergeStreamUpdate } from "./merge.ts";
import type { LiveGame, LiveGameUpdate } from "./types.ts";

const START = "8/8/8/8/8/8/8/8";
const fen = (move: number, side: "w" | "b") => `${START} ${side} - - 0 ${move}`;

function game(over: Partial<LiveGame> = {}): LiveGame {
  const p = { name: "A", title: null, rating: null, fed: null, fideId: null, clockMs: null };
  return { id: "g", roundId: "r", white: p, black: { ...p, name: "B" }, fen: fen(10, "w"), lastMoveUci: "e2e4", result: "*", thinkTimeSec: null, pgn: null, updatedAt: 1, ...over };
}

function upd(over: Partial<LiveGameUpdate> = {}): LiveGameUpdate {
  const p = { name: "A", title: null, rating: null, fideId: null };
  return { id: "g", roundId: "r", pgn: "pgn", fen: fen(10, "w"), lastMoveUci: "e2e4", result: "*", white: p, black: { ...p, name: "B" }, whiteClockMs: 1000, blackClockMs: 2000, ...over };
}

describe("fenPly", () => {
  it("orders by full-move number and side to move", () => {
    assert.ok(fenPly(fen(10, "b"))! > fenPly(fen(10, "w"))!);
    assert.ok(fenPly(fen(11, "w"))! > fenPly(fen(10, "b"))!);
    assert.equal(fenPly("garbage"), null);
  });
});

describe("snapshot merge", () => {
  it("applies a newer snapshot and drops the stale pgn", () => {
    const prev = game({ pgn: "old" });
    const next = mergeSnapshotGame(prev, game({ fen: fen(10, "b"), lastMoveUci: "e7e5", thinkTimeSec: 4 }));
    assert.equal(next.fen, fen(10, "b"));
    assert.equal(next.pgn, null);
    assert.equal(next.thinkTimeSec, 4);
  });

  it("SIG-1312: a newer snapshot clears the stream's lastEval; an older one keeps it", () => {
    const prev = game({ pgn: "pgn", lastEval: { pawns: 0.4 } });
    assert.equal(mergeSnapshotGame(prev, game({ fen: fen(10, "b") })).lastEval, null);
    assert.deepEqual(mergeSnapshotGame(prev, game({ fen: fen(9, "b") })).lastEval, { pawns: 0.4 });
  });

  it("never moves a game backwards, but still contributes the federation", () => {
    const prev = game({ fen: fen(12, "w"), pgn: "pgn" });
    const incoming = game({ fen: fen(11, "b"), white: { ...game().white, fed: "NOR", title: "GM", rating: 2800 } });
    const next = mergeSnapshotGame(prev, incoming);
    assert.equal(next.fen, prev.fen);
    assert.equal(next.pgn, "pgn");
    assert.equal(next.white.fed, "NOR");
    assert.equal(next.white.title, "GM");
  });

  it("a final result is newer; a '*' snapshot never reopens a decided game", () => {
    assert.equal(mergeSnapshotGame(game(), game({ result: "1-0" })).result, "1-0");
    const decided = game({ result: "1-0", fen: fen(40, "w") });
    assert.equal(mergeSnapshotGame(decided, game({ fen: fen(41, "w") })), decided);
  });
});

describe("stream merge", () => {
  it("is authoritative and may move a game backwards", () => {
    const prev = game({ fen: fen(12, "w"), pgn: "wrong" });
    const next = mergeStreamUpdate(prev, upd({ fen: fen(11, "w"), pgn: "corrected" }), 5);
    assert.equal(next.fen, fen(11, "w"));
    assert.equal(next.pgn, "corrected");
    assert.equal(next.updatedAt, 5);
  });

  it("keeps title, rating, federation and fideId from the snapshot", () => {
    const prev = game({ white: { name: "A", title: "GM", rating: 2800, fed: "NOR", fideId: 1503014, clockMs: null } });
    const next = mergeStreamUpdate(prev, upd({ pgn: "p2" }), 5);
    assert.deepEqual(
      [next.white.title, next.white.rating, next.white.fed, next.white.fideId, next.white.clockMs],
      ["GM", 2800, "NOR", 1503014, 1000],
    );
  });

  it("a PGN value wins over the stored one; think time is kept only for the same position", () => {
    const prev = game({ white: { ...game().white, rating: 2700 }, thinkTimeSec: 9 });
    const same = mergeStreamUpdate(prev, upd({ pgn: "x", white: { name: "A", title: null, rating: 2750, fideId: null } }), 1);
    assert.equal(same.white.rating, 2750);
    assert.equal(same.thinkTimeSec, 9);
    assert.equal(mergeStreamUpdate(prev, upd({ pgn: "y", fen: fen(11, "w") }), 1).thinkTimeSec, null);
  });

  it("SIG-1312: carries the update's lastEval, null when the PGN has none", () => {
    assert.deepEqual(mergeStreamUpdate(undefined, upd({ lastEval: { mate: -2 } }), 5).lastEval, { mate: -2 });
    const prev = game({ pgn: "old", lastEval: { pawns: 1 } });
    assert.equal(mergeStreamUpdate(prev, upd({ pgn: "new", lastEval: null }), 5).lastEval, null);
  });

  it("returns the same object for a re-sent identical game", () => {
    const first = mergeStreamUpdate(undefined, upd(), 1);
    assert.equal(mergeStreamUpdate(first, upd(), 2), first);
  });
});
