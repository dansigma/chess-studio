import assert from "node:assert/strict";
import test from "node:test";
import type { Statement } from "../../chess/explain/model.ts";
import { marksForStatement } from "./why-marks.ts";

const statement = {
  id: "attacks-loose-piece",
  params: { piece: "n", target: "p", square: "e5" },
  highlight: { squares: ["f3", "e5", "e5"], arrows: [{ from: "f3", to: "e5" }, { from: "e5", to: "e5" }], at: "after" },
} as Statement;

test("squares are de-duplicated and coloured by section", () => {
  const marks = marksForStatement(statement, "alternative");
  assert.deepEqual(marks.squares, [
    { square: "f3", color: "G" },
    { square: "e5", color: "G" },
  ]);
  assert.deepEqual(marks.arrows, [{ from: "f3", to: "e5", color: "G" }]);
});

test("each section has its own colour", () => {
  assert.equal(marksForStatement(statement, "move").squares[0].color, "B");
  assert.equal(marksForStatement(statement, "consequences").squares[0].color, "R");
});
