// SIG-1221: schema validation tests.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonl, toJsonl, validateItem, validateItems } from "./schema.mjs";
import { fixtureItems } from "./test-helpers.mjs";

const base = () => structuredClone(fixtureItems().items[0]);

describe("validateItem", () => {
  it("accepts every ingested fixture item", () => {
    const { items } = fixtureItems();
    assert.equal(items.length, 21);
    assert.deepEqual(validateItems(items), { ok: true, errors: [] });
  });

  it("rejects an illegal FEN with the item id in the message", () => {
    const item = { ...base(), fen: "8/8/8/8/8/8/8/8 w - - 0 1" };
    const { ok, errors } = validateItem(item);
    assert.equal(ok, false);
    assert.match(errors[0], /^synthetic-fixture\.synthetic\.g1\.m1: illegal FEN/);
  });

  it("rejects a played move that is not legal in the position", () => {
    const item = { ...base(), playedMove: { san: "Nb6", uci: "b5b6" } };
    assert.match(validateItem(item).errors.join("\n"), /illegal playedMove b5b6/);
  });

  it("rejects a SAN that does not match the UCI move", () => {
    const item = { ...base(), playedMove: { san: "Nc7", uci: "b5c7" } };
    assert.match(validateItem(item).errors.join("\n"), /does not match uci b5c7 \(Nc7\+\)/);
  });

  it("rejects an illegal author best move", () => {
    const item = { ...base(), authorBestMove: { san: "Ke2", uci: "e1e5" } };
    assert.match(validateItem(item).errors.join("\n"), /authorBestMove/);
  });

  it("rejects unknown themes in themes, mustMention and mustNotClaim, naming the known ones", () => {
    const item = { ...base(), themes: ["fork", "bogus"], mustMention: ["nope"], mustNotClaim: ["fork", "zzz"] };
    const text = validateItem(item).errors.join("\n");
    assert.match(text, /unknown theme "bogus" in themes \(known: fork, /);
    assert.match(text, /unknown theme "nope" in mustMention/);
    assert.match(text, /unknown theme "zzz" in mustNotClaim/);
  });

  it("reports every problem at once and rejects bad phase, band and types", () => {
    const { errors } = validateItem({ id: "x", source: {}, fen: 3, playedMove: null, nags: "no", themes: "no", phase: "late", ratingBand: "gold" });
    assert.ok(errors.length >= 8, errors.join("\n"));
    assert.ok(errors.every((error) => error.startsWith("x: ")));
  });

  it("rejects non-objects and duplicate ids", () => {
    assert.equal(validateItem(null).ok, false);
    const item = base();
    assert.match(validateItems([item, item]).errors.join("\n"), /duplicate id/);
  });
});

describe("jsonl", () => {
  it("round-trips and reports the line of malformed JSON", () => {
    const { items } = fixtureItems();
    assert.deepEqual(parseJsonl(toJsonl(items.slice(0, 3))), items.slice(0, 3));
    assert.throws(() => parseJsonl('{"a":1}\n{oops\n', "file.jsonl"), /file\.jsonl:2: not valid JSON/);
  });
});
