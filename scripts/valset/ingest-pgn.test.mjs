// SIG-1221: ingestion tests on the synthetic fixture and on inline PGN.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { contextPgnFor, ingestPgnText, main, slug } from "./ingest-pgn.mjs";
import { parseJsonl, validateItems } from "./schema.mjs";
import { FIXTURE_PGN, fixtureItems } from "./test-helpers.mjs";

const byGame = (items, n) => items.filter((item) => item.source.game === n);

describe("ingest the synthetic fixture", () => {
  const { items, warnings } = fixtureItems();

  it("emits one valid item per annotated main-line move, with stable ids", () => {
    assert.equal(items.length, 21);
    assert.equal(validateItems(items).ok, true);
    assert.equal(items[0].id, "synthetic-fixture.synthetic.g1.m1");
    assert.deepEqual(items.filter((item) => item.source.game === 11).map((item) => item.id), [
      "synthetic-fixture.synthetic.g11.m5",
      "synthetic-fixture.synthetic.g11.m7",
    ]);
    assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  });

  it("detects themes from the comment text in English and Portuguese", () => {
    const themes = (game) => byGame(items, game)[0].themes;
    assert.deepEqual(themes(1), ["fork"]);
    assert.deepEqual(themes(2), ["fork"]);
    assert.deepEqual(themes(3), ["pin"]);
    assert.deepEqual(themes(4), ["pin"]);
    assert.deepEqual(themes(5), ["skewer"]);
    assert.deepEqual(themes(6), ["hanging"]);
    assert.deepEqual(themes(7), ["hanging"]);
    assert.deepEqual(themes(8), ["trapped"]);
    assert.deepEqual(themes(9), ["back-rank"]);
    assert.deepEqual(themes(10), ["back-rank"]);
    assert.deepEqual(themes(11), ["mate-threat"]);
    assert.deepEqual(byGame(items, 11)[1].themes, ["mate"]);
    assert.deepEqual(themes(12), ["mate-threat"]);
  });

  it("keeps the comment as authorText and reads NAGs", () => {
    const skewer = byGame(items, 5)[0];
    assert.match(skewer.authorText, /^A skewer:/);
    assert.deepEqual(skewer.nags, [1]);
    assert.deepEqual(byGame(items, 14)[0].nags, [6]);
  });

  it("takes authorBestMove from the first variation only when the NAG marks the move bad", () => {
    assert.deepEqual(byGame(items, 14)[0].authorBestMove, { san: "Rd4", uci: "d3d4" });
    assert.deepEqual(byGame(items, 15)[0].authorBestMove, { san: "h4", uci: "h2h4" });
    assert.equal(byGame(items, 1)[0].authorBestMove, null);
  });

  it("lets [%themes] replace text detection, and keeps unknown and unmapped words visible", () => {
    const labelled = byGame(items, 18)[0];
    assert.equal(labelled.handLabelled, true);
    assert.deepEqual(labelled.themes, ["fork", "zugzwang"]);
    assert.deepEqual(labelled.textThemes, []);
    assert.deepEqual(labelled.unmappedThemes, ["zugzwang"]);
    assert.deepEqual(labelled.unknownTags, ["bogus"]);
    assert.deepEqual(labelled.mustMention, ["fork"]);
    assert.deepEqual(labelled.mustNotClaim, ["trapped"]);
    assert.ok(!labelled.authorText.includes("[%"));
    assert.ok(warnings.some((warning) => warning.includes('unknown theme tag "bogus"')));
  });

  it("does not count negated words", () => {
    assert.deepEqual(byGame(items, 19)[0].themes, []);
  });

  it("derives phase, rating band and tactical/positional", () => {
    assert.equal(byGame(items, 1)[0].phase, "endgame");
    assert.equal(byGame(items, 8)[0].phase, "middlegame");
    assert.equal(byGame(items, 11)[0].phase, "opening");
    assert.equal(byGame(items, 1)[0].ratingBand, "<1200");
    assert.equal(byGame(items, 17)[0].ratingBand, "2000+");
    assert.equal(byGame(items, 1)[0].tactical, true);
    assert.equal(byGame(items, 16)[0].tactical, false);
  });

  it("writes the context PGN for standard and non-standard starts", () => {
    assert.equal(byGame(items, 11)[0].contextPgn, "1. e4 e5 2. Bc4 Nc6");
    assert.match(byGame(items, 1)[0].contextPgn, /\[FEN "r3k3\/8\/8\/1N6\/8\/8\/8\/4K3 w - - 0 1"\]/);
    assert.equal(contextPgnFor("4k3/8/8/8/8/8/8/4K3 b - - 0 7", ["Kd8", "Kd2"]).split("\n").pop(), "7... Kd8 8. Kd2");
  });
});

describe("ingest edge cases", () => {
  it("emits NAG-only moves with empty text, skips unannotated moves, and reads several games", () => {
    const pgn = `[Event "A"]\n\n1. e4 e5 2. Nf3 $2 *\n\n[Event "B"]\n\n1. d4 d5 2. c4 { Queen's gambit. } *\n`;
    const { items } = ingestPgnText(pgn, { course: "Inline" });
    assert.deepEqual(items.map((item) => [item.source.game, item.playedMove.san, item.authorText]), [
      [1, "Nf3", ""],
      [2, "c4", "Queen's gambit."],
    ]);
  });

  it("warns about games without playable moves instead of failing", () => {
    const { items, warnings } = ingestPgnText(`[Event "A"]\n\n1. Ke4 *\n`, { course: "Inline" });
    assert.equal(items.length, 0);
    assert.ok(warnings.length > 0);
  });

  it("slugs accents and punctuation", () => {
    assert.equal(slug("Curso de Tática #1"), "curso-de-tatica-1");
  });

  it("the CLI writes valid JSONL", () => {
    const dir = mkdtempSync(join(tmpdir(), "valset-ingest-"));
    const out = join(dir, "items.jsonl");
    const log = console.log;
    console.log = () => {};
    const code = main([FIXTURE_PGN, "--source", "Synthetic fixture", "--out", out]);
    console.log = log;
    assert.equal(code, 0);
    const items = parseJsonl(readFileSync(out, "utf8"));
    assert.equal(items.length, 21);
    assert.equal(validateItems(items).ok, true);
  });

  it("the CLI prints usage without arguments", () => {
    const error = console.error;
    console.error = () => {};
    assert.equal(main([]), 2);
    console.error = error;
  });
});
