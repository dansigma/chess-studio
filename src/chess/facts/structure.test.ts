import assert from "node:assert/strict";
import test from "node:test";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { computeMoveFacts, computePositionFacts, structureChanges } from "./index.ts";

function play(line: string) {
  const chess = new Chess();
  for (const san of line.split(" ")) chess.move(san);
  return chess;
}

test("the start position has no pawn breaks, rams, imbalance, or tension", () => {
  const { breaks, centre } = computePositionFacts(DEFAULT_POSITION);
  assert.deepEqual(breaks, []);
  assert.deepEqual(centre, { rams: [], asymmetricFiles: 0, tension: 0 });
});

test("French Advance has c5 and f6 breaks for Black and two central rams", () => {
  const { breaks, centre } = computePositionFacts(play("e4 e6 d4 d5 e5").fen());
  assert.deepEqual(breaks.filter(({ side }) => side === "b"), [
    { side: "b", from: "c7", to: "c5" },
    { side: "b", from: "f7", to: "f6" },
  ]);
  assert.deepEqual(centre, { rams: ["d4", "e5"], asymmetricFiles: 0, tension: 0 });
});

test("the Carlsbad b-pawn needs to reach b5 to touch c6", () => {
  const chess = play("d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5");
  assert.deepEqual(computePositionFacts(chess.fen()).breaks.filter(({ from }) => from === "b2"), []);
  chess.move("b4");
  chess.move("c6");
  assert.deepEqual(computePositionFacts(chess.fen()).breaks.filter(({ from }) => from === "b4"), [
    { side: "w", from: "b4", to: "b5" },
  ]);
});

test("the King's Indian Mar del Plata offers f5 and c5 breaks", () => {
  const { breaks } = computePositionFacts(play("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7").fen());
  assert.deepEqual(breaks.filter(({ from }) => from === "c4" || from === "f7"), [
    { side: "w", from: "c4", to: "c5" },
    { side: "b", from: "f7", to: "f5" },
  ]);
});

test("a double advance requires the middle square and destination to be empty", () => {
  const clear = computePositionFacts("4k3/8/8/3p4/8/8/2P5/4K3 w - - 0 1");
  const blocked = computePositionFacts("4k3/8/8/3p4/8/2N5/2P5/4K3 w - - 0 1");
  const occupied = computePositionFacts("4k3/8/8/3p4/2n5/8/2P5/4K3 w - - 0 1");
  assert.deepEqual(clear.breaks.filter(({ side }) => side === "w"), [{ side: "w", from: "c2", to: "c4" }]);
  assert.deepEqual(blocked.breaks.filter(({ side }) => side === "w"), []);
  assert.deepEqual(occupied.breaks.filter(({ side }) => side === "w"), []);
});

test("centre counts each pawn capture contact once and ignores rams outside c–f", () => {
  const { centre } = computePositionFacts("4k3/8/8/p1p1p3/P2P4/2P5/8/4K3 w - - 0 1");
  assert.deepEqual(centre, { rams: [], asymmetricFiles: 2, tension: 2 });
});

test("exd5 leaves the e-file half-open for White and the d-file half-open for Black", () => {
  const chess = play("e4 d5");
  const move = chess.move("exd5");
  const changes = structureChanges(move.before, move.after);
  assert.deepEqual(changes, [
    { kind: "file-half-opened", file: "d", for: "b" },
    { kind: "file-half-opened", file: "e", for: "w" },
    { kind: "pawn-doubled", side: "w", file: "d" },
  ]);
  assert.deepEqual(computeMoveFacts(move.before, move.lan)?.structureChanges, changes);
});

test("cxd5 opens the c-file for White and changes which side has a half-open d-file", () => {
  const chess = play("c4 d5");
  const move = chess.move("cxd5");
  assert.deepEqual(structureChanges(move.before, move.after), [
    { kind: "file-half-opened", file: "c", for: "w" },
    { kind: "file-half-opened", file: "d", for: "b" },
    { kind: "pawn-doubled", side: "w", file: "d" },
  ]);
});

test("a pawn taking a piece can give Black isolated doubled pawns", () => {
  const chess = new Chess("4k3/4p3/8/5p2/4N3/4P3/8/4K3 b - - 0 1");
  const move = chess.move("fxe4");
  assert.deepEqual(structureChanges(move.before, move.after), [
    { kind: "file-opened", file: "f" },
    { kind: "pawn-isolated", side: "b", file: "e" },
    { kind: "pawn-doubled", side: "b", file: "e" },
  ]);
});

test("a capture can close a half-open file and create an isolated passed pawn", () => {
  const chess = new Chess("4k3/4p3/8/4n3/3P4/8/8/4K3 w - - 0 1");
  const move = chess.move("dxe5");
  assert.deepEqual(structureChanges(move.before, move.after), [
    { kind: "file-opened", file: "d" },
    { kind: "file-closed", file: "e" },
    { kind: "pawn-isolated", side: "w", file: "e" },
  ]);
  const reply = new Chess("4k3/8/4p3/3P4/8/8/8/4K3 w - - 0 1").move("dxe6");
  assert.deepEqual(structureChanges(reply.before, reply.after), [
    { kind: "file-opened", file: "d" },
    { kind: "file-half-opened", file: "e", for: "b" },
    { kind: "pawn-isolated", side: "w", file: "e" },
    { kind: "pawn-passed", side: "w", file: "e" },
  ]);
});
