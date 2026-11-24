import assert from "node:assert/strict";
import test from "node:test";
import { Chess, DEFAULT_POSITION } from "chess.js";
import { auditAnswer, extractClaims, replayAnswerPosition, stripFalse } from "./audit.ts";

test("extracts claims and hides missing, malformed and truncated metadata", () => {
  const claim = { type: "pins", piece: "Re1", target: "e7" };
  assert.deepEqual(extractClaims(`Draft.<claims>${JSON.stringify([claim])}</claims>`), {
    body: "Draft.", claims: [claim],
  });
  for (const text of [
    "Draft.", "Draft.<claims>not JSON</claims>", "Draft.<claims>[{}]</claims>",
    "Draft.<claims>[", "Draft.</claims>",
  ]) {
    assert.deepEqual(extractClaims(text), { body: "Draft.", claims: [] });
  }
});

test("checks the pinning piece, blocked diagonal, defense, hanging piece and threats", () => {
  const position = replayAnswerPosition("4k3/4n3/8/3p1B2/2N5/3P4/8/4R1K1 w - - 0 1", undefined);
  const audit = auditAnswer("", [
    { type: "pins", piece: "Re1", target: "e7" },
    { type: "pins", piece: "Re1", target: "c4" },
    { type: "attacks", piece: "Bf5", target: "c2" },
    { type: "defends", piece: "Pd3", target: "c4" },
    { type: "hanging", piece: "Nc4" },
    { type: "threatens", piece: "d5", target: "c4" },
    { type: "threatens", piece: "d5", target: "e7" },
  ], position);
  assert.equal(audit.ok, false);
  assert.deepEqual(audit.falseClaims.map(({ claim }) => claim.target), ["c4", "c2", "e7"]);
  assert.match(audit.falseClaims[0].truth, /e7/);
});

test("checks historical lines only when replay reaches the current board", () => {
  const chess = new Chess();
  chess.move("c4");
  chess.move("e5");
  const position = replayAnswerPosition(chess.fen(), { moves: ["c4", "e5"] });
  const body = "[[1...c5 2.Nf3]] [[2.Nf3]] [[2.Bh8]]";
  assert.deepEqual(auditAnswer(body, [], position).illegalLines, ["2.Bh8"]);
  const divergent = replayAnswerPosition(chess.fen(), { moves: ["d4", "d5"] });
  assert.deepEqual(auditAnswer(body, [], divergent).illegalLines, ["1...c5 2.Nf3", "2.Bh8"]);
  const customFen = "4k3/8/8/8/8/8/8/4K2R w - - 0 23";
  const custom = new Chess(customFen);
  custom.move("Rh2");
  const customPosition = replayAnswerPosition(custom.fen(), { startFen: customFen, moves: ["Rh2"] });
  assert.equal(auditAnswer("[[23.Rh3]]", [], customPosition).ok, true);
});

test("removes whole false sentences and illegal lines while keeping nearby prose and legal lines", () => {
  const position = replayAnswerPosition(DEFAULT_POSITION, undefined);
  const body = "Try [[1.e4 e5]]. The bishop on c1 attacks h6. Develop a knight. [[1.Bh6]]";
  const audit = auditAnswer(body, [{ type: "attacks", piece: "Bc1", target: "h6" }], position);
  assert.equal(stripFalse(body, audit), "Try [[1.e4 e5]]. Develop a knight.");
});
