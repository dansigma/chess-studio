import assert from "node:assert/strict";
import test from "node:test";
import { explainMove } from "./explain-move.ts";
import { SCENARIOS, explain, ids, inputFor } from "./fixtures.ts";
import { gatherFacts } from "./gather.ts";

test("a mating move is explained by the mate alone", () => {
  assert.deepEqual(ids(explain(SCENARIOS.foolsMate)), ["gives-mate"]);
});

test("a missed mate names the mating alternative", () => {
  const result = explain(SCENARIOS.legalMissedMate);
  const list = ids(result);
  assert.ok(list.includes("best-alternative"));
  assert.ok(list.includes("best-gives-mate"));
  assert.ok(list.includes("captures"));
  assert.equal(result.confident, true);
  assert.equal(result.summary.bestSan, "Nd5#");
  assert.equal(result.summary.playedIsBest, false);
});

test("a sacrifice that ends in mate says so", () => {
  const list = ids(explain(SCENARIOS.legalSacrifice));
  assert.ok(list.includes("gives-up-material"));
  assert.ok(list.includes("sacrifice-leads-to-mate"));
  assert.ok(!list.includes("sacrifice-regains-material"));
});

test("attacking a pinned piece is recognised", () => {
  const found = explain(SCENARIOS.pinnedKnight)
    .sections.flatMap((section) => section.statements)
    .find((item) => item.id === "attacks-pinned-piece");
  assert.deepEqual(found?.params, { target: "n", square: "c3", pin: "absolute" });
  assert.ok(found?.highlight.squares.includes("c3"));
});

test("a quiet move with nothing provable has no statements and is not confident", () => {
  const result = explain(SCENARIOS.quietMove);
  assert.deepEqual(result.sections, []);
  assert.equal(result.confident, false);
  assert.equal(result.summary.playedIsBest, true);
});

test("an attack on an unprotected pawn is reported", () => {
  assert.ok(ids(explain(SCENARIOS.attackLoosePawn)).includes("attacks-loose-piece"));
});

test("hanging the queen is reported as a blunder reason", () => {
  const list = ids(explain(SCENARIOS.queenHangs));
  assert.ok(list.includes("allows-capture") || list.includes("moves-into-attack"));
  assert.ok(list.includes("gives-check"));
});

test("an allowed fork is reported", () => {
  assert.ok(ids(explain(SCENARIOS.forkAllowed)).includes("allows-fork"));
});

test("castling is named", () => {
  assert.ok(ids(explain(SCENARIOS.castles)).includes("castles"));
});

test("a recapture is told apart from a plain capture", () => {
  const input = inputFor({ prefix: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5", move: "Nxd5", best: ["Na5"], label: "blunder" });
  const plain = explainMove(input);
  assert.ok(plain && ids(plain).includes("captures"));
  const again = explainMove({ ...input, previous: { to: "d5", capture: true } });
  assert.ok(again && ids(again).includes("recaptures"));
  assert.ok(again && !ids(again).includes("captures"));
});

test("negative sections only appear for negative labels", () => {
  const good = explainMove({ ...inputFor(SCENARIOS.forkAllowed), label: "best" });
  assert.ok(good?.sections.every((section) => section.id === "move"));
  const bad = explainMove(inputFor(SCENARIOS.forkAllowed));
  assert.ok(bad?.sections.some((section) => section.id === "alternative"));
});

test("no alternative is offered when the played move is the engine's move", () => {
  const result = explainMove({ ...inputFor(SCENARIOS.castles), label: "blunder" });
  assert.ok(result?.sections.every((section) => section.id !== "alternative"));
});

test("honesty: statements disappear when the facts that prove them are removed", () => {
  const input = inputFor(SCENARIOS.legalSacrifice);
  const facts = gatherFacts(input.fenBefore, input.playedUci, input.bestPv);
  assert.ok(facts);
  const stripped = {
    ...facts,
    after: { ...facts.after, pieces: facts.after.pieces.map((piece) => ({ ...piece, hanging: false })) },
    played: {
      ...facts.played,
      sacrifice: false,
      check: false,
      mate: false,
      capture: null,
      pv: null,
      attacks: [],
      defends: [],
      threats: { neutralized: [], created: [], exposed: [] },
    },
  };
  const result = explainMove({ ...input, facts: stripped, label: "blunder" });
  assert.deepEqual(result?.sections, []);
  assert.equal(result?.confident, false);
});

test("honesty: compensation is not claimed without an engine line", () => {
  const input = inputFor(SCENARIOS.legalSacrifice);
  const facts = gatherFacts(input.fenBefore, input.playedUci, input.bestPv);
  assert.ok(facts);
  const result = explainMove({ ...input, facts: { ...facts, played: { ...facts.played, pv: null } } });
  assert.ok(result);
  assert.ok(!ids(result).includes("sacrifice-leads-to-mate"));
  assert.ok(!ids(result).includes("sacrifice-regains-material"));
});

test("an illegal move yields no explanation", () => {
  assert.equal(explainMove({ ...inputFor(SCENARIOS.quietMove), playedUci: "e2e5" }), null);
});

test("highlights say which position they belong to", () => {
  const result = explain(SCENARIOS.legalMissedMate);
  const at = (id: string) => result.sections.flatMap((section) => section.statements).find((item) => item.id === id)?.highlight.at;
  assert.equal(at("captures"), "before");
  assert.equal(at("best-gives-mate"), "before");
  assert.equal(at("best-alternative"), "before");
  const after = explain(SCENARIOS.pinnedKnight).sections.flatMap((section) => section.statements);
  assert.ok(after.every((item) => item.highlight.at === "after"));
});

test("every highlight square is a real square", () => {
  for (const scenario of Object.values(SCENARIOS)) {
    for (const item of explain(scenario).sections.flatMap((section) => section.statements)) {
      for (const square of [...item.highlight.squares, ...item.highlight.arrows.flatMap((arrow) => [arrow.from, arrow.to])]) {
        assert.match(square, /^[a-h][1-8]$/);
      }
    }
  }
});
