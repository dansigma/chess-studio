import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { fenPly, parseAnswer } from "./answer-lines.ts";

const chess = new Chess();
const lineFens = [chess.fen(), ...["d4", "d5", "Nc3", "Nf6", "Bg5", "Nbd7", "e3"].map((san) => chess.move(san).after)];
const position = { currentFen: chess.fen(), lineFens, lineStartPly: 0 };

test("parses a numbered Black continuation at the question position", () => {
  const raw = "4...a6 5.Bf4 e6";
  assert.deepEqual(parseAnswer(`Try [[${raw}]].`, position), [
    { type: "text", text: "Try " },
    { type: "line", raw, startFen: position.currentFen, startPly: 7, moves: [
      { san: "a6", uci: "a7a6" },
      { san: "Bf4", uci: "g5f4" },
      { san: "e6", uci: "e7e6" },
    ] },
    { type: "text", text: "." },
  ]);
});

test("resolves earlier moves on a line whose root starts midgame and normalizes SAN", () => {
  const raw = "3. Bf4!?";
  assert.deepEqual(parseAnswer(`[[${raw}]]`, {
    ...position, lineFens: lineFens.slice(4), lineStartPly: fenPly(lineFens[4]),
  }), [{
    type: "line", raw, startFen: lineFens[4], startPly: 4, moves: [{ san: "Bf4", uci: "c1f4" }],
  }]);
});

test("rejects the entire line if any move is illegal or numbered inconsistently", () => {
  for (const raw of ["4...a6 5.Bh8", "4...a6 6.Bf4", "4...--", "5.Bf4", "a6"]) {
    assert.deepEqual(parseAnswer(`[[${raw}]]`, position), [{ type: "invalid-line", raw }]);
  }
});

test("keeps an unfinished streaming line as text", () => {
  const text = "Try [[4...a6 5.B";
  assert.deepEqual(parseAnswer(text, position), [{ type: "text", text }]);
});

test("parses citation IDs without access to the question's game list", () => {
  assert.deepEqual(parseAnswer("{{game:42}}{{game:unknown}}", position), [
    { type: "game", id: "42" },
    { type: "game", id: "unknown" },
  ]);
});

test("keeps citations, playable lines, and prose in order", () => {
  assert.deepEqual(parseAnswer("See {{game:42}} and try [[4...a6]].", position), [
    { type: "text", text: "See " },
    { type: "game", id: "42" },
    { type: "text", text: " and try " },
    {
      type: "line", raw: "4...a6", startFen: position.currentFen, startPly: 7,
      moves: [{ san: "a6", uci: "a7a6" }],
    },
    { type: "text", text: "." },
  ]);
});
