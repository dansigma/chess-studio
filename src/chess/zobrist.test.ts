import assert from "node:assert/strict";
import test from "node:test";
import { positionKey } from "./zobrist.ts";

const START =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("positionKey is deterministic for the same FEN", () => {
  assert.equal(positionKey(START), positionKey(START));
  assert.equal(typeof positionKey(START), "bigint");
});

test("positionKey ignores the clock fields", () => {
  const a = positionKey(START);
  const b = positionKey(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 42 99",
  );
  assert.equal(a, b);
});

test("positionKey is sensitive to side to move", () => {
  const white = positionKey(START);
  const black = positionKey(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
  );
  assert.notEqual(white, black);
});

test("positionKey is sensitive to castling rights", () => {
  const full = positionKey(START);
  const none = positionKey(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1",
  );
  assert.notEqual(full, none);
});

test("positionKey is sensitive to the en passant square", () => {
  const noEp = positionKey(
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  );
  const withEp = positionKey(
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  );
  assert.notEqual(noEp, withEp);
});

test("positionKey is sensitive to piece placement", () => {
  const a = positionKey(START);
  const b = positionKey(
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
  );
  assert.notEqual(a, b);
});

test("positionKey tolerates surrounding and extra whitespace", () => {
  assert.equal(positionKey(`  ${START}  `), positionKey(START));
  assert.equal(
    positionKey("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR   w   KQkq   -   0 1"),
    positionKey(START),
  );
});
