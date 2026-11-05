// SIG-1221: metric computation on the synthetic fixture (precomputed engine ground
// truth, no Stockfish), the contradiction rules, and the report/runner output.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, it } from "node:test";
import { RULES, buildReport, checkExplanation, evaluateItem, renderMarkdown } from "./metrics.mjs";
import { main as runMain } from "./run.mjs";
import { toJsonl } from "./schema.mjs";
import { fixtureItemsWithTruth } from "./test-helpers.mjs";

let items;
let report;
before(async () => {
  items = await fixtureItemsWithTruth();
  report = buildReport(items, { split: "dev" });
});

const find = (suffix) => items.find((item) => item.id.endsWith(suffix));

describe("recall on the fixture", () => {
  it("evaluates every item without errors", () => {
    assert.equal(report.items, 21);
    assert.equal(report.evaluated, 21);
    assert.deepEqual(report.errors, []);
    assert.equal(report.withEngineTruth, 21);
  });

  it("recalls the constructed tactics fully", () => {
    for (const theme of ["fork", "pin", "skewer", "trapped", "back-rank", "mate-threat", "mate", "sacrifice", "discovered-attack", "passed-pawn", "seventh-rank"]) {
      assert.equal(report.perTheme[theme].recall, 1, theme);
      assert.ok(report.perTheme[theme].labelled > 0, theme);
    }
    assert.equal(report.perTheme.fork.labelled, 3);
    assert.equal(report.perTheme.pin.labelled, 2);
  });

  it("has one deliberate miss: a 'loose piece' nothing attacks is not a hanging fact", () => {
    assert.equal(report.perTheme.hanging.labelled, 2);
    assert.equal(report.perTheme.hanging.hit, 1);
    assert.equal(report.perTheme.hanging.recall, 0.5);
    assert.deepEqual(report.perTheme.hanging.misses.map((miss) => miss.id), ["synthetic-fixture.synthetic.g7.m1"]);
    assert.ok(report.overall.recall < 1);
    assert.equal(report.overall.labelled - report.overall.hit, 1);
  });

  it("checks that the squares the author names are the squares of the fact", () => {
    assert.equal(report.perTheme.fork.squareChecked, 2);
    assert.equal(report.perTheme.fork.squareAgree, 2);
  });

  it("splits recall by phase and theme x phase", () => {
    assert.equal(report.perPhase.endgame.recall < 1, true, "the miss is an endgame position");
    assert.equal(report.perPhase.opening.recall, 1);
    assert.equal(report.perPhase.middlegame.recall, 1);
    assert.equal(report.perPhase.endgame.themes.hanging.recall, 0.5);
  });

  it("counts detections the author did not mention separately from recall", () => {
    assert.ok(report.overall.unlabelledDetections > 0);
    assert.equal(report.perTheme.hanging.unlabelledDetections > 0, true);
    assert.equal(report.perTheme.xray.labelled, 0);
    assert.equal(report.perTheme.xray.agreement, null);
  });

  it("checks hand-verified mustMention and mustNotClaim", () => {
    assert.deepEqual(report.hardChecks.mustMention, { total: 1, hit: 1, failures: [] });
    assert.deepEqual(report.hardChecks.mustNotClaim, { total: 1, violations: [] });
  });

  it("flips a mustNotClaim into a violation when the facts do report the theme", () => {
    const tampered = items.map((item) => (item.id.endsWith(".g3.m1") ? { ...item, mustNotClaim: ["pin"], mustMention: ["skewer"] } : item));
    const result = buildReport(tampered);
    assert.equal(result.hardChecks.mustNotClaim.violations[0].id, "synthetic-fixture.synthetic.g3.m1");
    assert.equal(result.hardChecks.mustMention.failures[0].theme, "skewer");
  });

  it("lists unmapped themes and unknown tags instead of dropping them", () => {
    assert.deepEqual(report.unmappedThemes, { zugzwang: 1, space: 1 });
    assert.deepEqual(report.unknownTags, { bogus: 1 });
  });

  it("reports author-vs-engine disagreements", () => {
    assert.deepEqual(report.authorDisagrees.map((d) => d.id.split(".").slice(-2).join(".")), ["g14.m1", "g15.m3", "g20.m3"]);
  });

  it("is deterministic", () => {
    assert.deepEqual(buildReport(items, { split: "dev" }), report);
    assert.equal(renderMarkdown(report), renderMarkdown(buildReport(items, { split: "dev" })));
  });
});

describe("the fact predicates, one by one on the constructed positions", () => {
  const hits = (suffix) =>
    Object.entries(evaluateItem(find(suffix)).detections)
      .filter(([, d]) => d.hit)
      .map(([theme]) => theme);

  it("sees the expected theme for each constructed position", () => {
    assert.ok(hits(".g1.m1").includes("fork"));
    assert.ok(hits(".g2.m1").includes("fork"));
    assert.ok(hits(".g3.m1").includes("pin"));
    assert.ok(hits(".g4.m1").includes("pin"));
    assert.ok(hits(".g5.m1").includes("skewer"));
    assert.ok(hits(".g6.m1").includes("hanging"));
    assert.ok(hits(".g8.m1").includes("trapped"));
    assert.ok(hits(".g9.m1").includes("back-rank") && hits(".g9.m1").includes("mate"));
    assert.ok(hits(".g11.m5").includes("mate-threat"));
    assert.ok(hits(".g13.m1").includes("discovered-attack"));
    assert.ok(hits(".g14.m1").includes("sacrifice"));
  });

  it("does not claim a back rank, trap or fork where there is none", () => {
    assert.ok(!hits(".g1.m1").includes("back-rank"));
    assert.ok(!hits(".g18.m1").includes("trapped"));
    assert.ok(!hits(".g16.m1").includes("fork"));
  });
});

describe("explainer contradiction rules", () => {
  const item = (overrides) => ({
    id: "t",
    nags: [],
    engine: { lines: [{ pv: [] }], evalBefore: { cp: 100 }, evalAfter: { score: { cp: 100 }, pv: [] }, lossCp: 0 },
    fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1",
    ...overrides,
  });
  const facts = { played: { mover: "w" }, after: { fen: "4k3/8/8/8/8/8/8/R3K3 b - - 0 1" } };
  const explanation = (section, id, params = {}) => ({ sections: [{ id: section, statements: [{ id, params }] }] });
  const rules = (list) => list.map((c) => c.rule);

  it("R1 compares best-line-wins-material with the replayed engine line", () => {
    const e = explanation("alternative", "best-line-wins-material", { points: 5 });
    assert.deepEqual(rules(checkExplanation(item({ engine: { ...item().engine, lines: [{ pv: ["a1a8"] }] } }), e, facts)), ["R1"], "the line wins no material");
    const fen = "4k3/r7/8/8/8/8/8/R3K3 w - - 0 1";
    assert.deepEqual(checkExplanation(item({ fen, engine: { ...item().engine, lines: [{ pv: ["a1a7"] }] } }), e, facts), [], "Rxa7 wins a rook");
  });

  it("R2 needs a forced mate for the mover for mate claims", () => {
    const mates = explanation("alternative", "best-line-mates", { san: "Qh5" });
    assert.deepEqual(rules(checkExplanation(item(), mates, facts)), ["R2"]);
    assert.deepEqual(checkExplanation(item({ engine: { ...item().engine, evalBefore: { mate: 3 } } }), mates, facts), []);
    const sac = explanation("move", "sacrifice-leads-to-mate", { piece: "q" });
    assert.deepEqual(rules(checkExplanation(item(), sac, facts)), ["R2"]);
    assert.deepEqual(checkExplanation(item({ engine: { ...item().engine, evalAfter: { score: { mate: 2 }, pv: [] } } }), sac, facts), []);
  });

  it("R3 needs a forced mate against the mover when the explainer says the move allows mate", () => {
    const e = explanation("consequences", "allows-mate", { from: "d8", to: "h4" });
    assert.deepEqual(rules(checkExplanation(item(), e, facts)), ["R3"]);
    assert.deepEqual(checkExplanation(item({ engine: { ...item().engine, evalAfter: { score: { mate: -1 }, pv: [] } } }), e, facts), []);
  });

  it("R4 catches a 'parried' threat that the engine's reply executes", () => {
    // Black moved; White (to move) can take the rook on a8, which the threat was aimed at.
    const blackMoved = { played: { mover: "b" }, after: { fen: "r3k3/8/8/8/8/8/8/R3K3 w - - 0 1" } };
    const parried = explanation("move", "neutralizes-threat", { kind: "hanging-capture", targets: ["a8"] });
    const reply = (uci) => item({ engine: { ...item().engine, evalAfter: { score: { cp: 0 }, pv: [uci] } } });
    assert.deepEqual(rules(checkExplanation(reply("a1a8"), parried, blackMoved)), ["R4"]);
    assert.deepEqual(checkExplanation(reply("e1e2"), parried, blackMoved), [], "the engine reply does something else");
    const elsewhere = explanation("move", "neutralizes-threat", { kind: "hanging-capture", targets: ["h8"] });
    assert.deepEqual(checkExplanation(reply("a1a8"), elsewhere, blackMoved), [], "the reply does not land on a threatened square");
  });

  it("R4 also catches a 'parried' mate threat when the engine reply mates", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1";
    const parried = explanation("move", "neutralizes-threat", { kind: "mate-in-1", targets: ["g8"] });
    const mating = item({ engine: { ...item().engine, evalAfter: { score: { mate: -1 }, pv: ["e1e8"] } } });
    assert.deepEqual(rules(checkExplanation(mating, parried, { played: { mover: "b" }, after: { fen: fen.replace(" b ", " w ") } })), ["R4"]);
  });

  it("R5 flags a sacrifice that 'regains material' while the engine says it loses 300 cp or more", () => {
    const e = explanation("move", "sacrifice-regains-material", { piece: "r" });
    assert.deepEqual(rules(checkExplanation(item({ engine: { ...item().engine, lossCp: 350 } }), e, facts)), ["R5"]);
    assert.deepEqual(checkExplanation(item({ engine: { ...item().engine, lossCp: 120 } }), e, facts), []);
  });

  it("R6 flags consequence statements on a move the author praised", () => {
    const e = explanation("consequences", "moves-into-attack", { piece: "n", square: "d5" });
    assert.deepEqual(rules(checkExplanation(item({ nags: [1] }), e, facts)), ["R6"]);
    assert.deepEqual(checkExplanation(item({ nags: [2] }), e, facts), []);
    assert.deepEqual(checkExplanation(item({ nags: [1] }), explanation("move", "captures", {}), facts), []);
  });

  it("documents every rule it can raise", () => {
    assert.deepEqual(RULES.map((rule) => rule.id), ["R1", "R2", "R3", "R4", "R5", "R6"]);
    assert.ok(RULES.every((rule) => rule.text.length > 40));
  });

  it("finds the one author-conflict contradiction on the fixture and none from R1-R5", () => {
    assert.deepEqual(report.explainer.byRule, { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 1 });
    assert.equal(report.explainer.contradictions[0].itemId, "synthetic-fixture.synthetic.g20.m3");
    assert.equal(report.explainer.contradictions[0].statement, "allows-mate");
  });
});

describe("report output", () => {
  it("renders the sections a reader needs", () => {
    const text = renderMarkdown(report);
    for (const heading of ["# Valset report (split: dev)", "## Per theme", "## Per phase", "### Recall by theme and phase", "## Misses", "## Hand-verified checks", "## Unmapped themes and unknown tags", "## Template explainer contradictions", "## Author vs engine", "## Theme to fact mapping"]) {
      assert.ok(text.includes(heading), heading);
    }
    assert.match(text, /synthetic\.g7\.m1/);
    assert.ok(!text.includes("| MoveFacts.mate | PvFacts"), "pipes inside table cells would break the table");
  });

  it("the runner CLI writes report.md and report.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "valset-run-"));
    const itemsPath = join(dir, "items.truth.jsonl");
    writeFileSync(itemsPath, toJsonl(items));
    const [log, error] = [console.log, console.error];
    console.log = console.error = () => {};
    let code;
    try {
      code = runMain([itemsPath, "--out", join(dir, "out"), "--lock", join(dir, "none.json")]);
    } finally {
      [console.log, console.error] = [log, error];
    }
    assert.equal(code, 0);
    assert.ok(existsSync(join(dir, "out", "report.md")));
    const json = JSON.parse(readFileSync(join(dir, "out", "report.json"), "utf8"));
    assert.equal(json.overall.labelled, report.overall.labelled);
  });

  it("the runner refuses the holdout without --i-know", () => {
    const dir = mkdtempSync(join(tmpdir(), "valset-run-"));
    const itemsPath = join(dir, "items.truth.jsonl");
    writeFileSync(itemsPath, toJsonl(items));
    const error = console.error;
    const messages = [];
    console.error = (m) => messages.push(String(m));
    try {
      assert.equal(runMain([itemsPath, "--split", "holdout", "--out", join(dir, "out")]), 1);
    } finally {
      console.error = error;
    }
    assert.match(messages.join(""), /--i-know/);
    assert.equal(existsSync(join(dir, "out", "report.holdout.md")), false);
  });
});
