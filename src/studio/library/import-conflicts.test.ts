import { test } from "node:test";
import assert from "node:assert/strict";
import { findNameConflict, gameDuplicateKey, mergeGames, nextFreeName, normalizeDatabaseName } from "./import-conflicts";
import type { ParsedFileGame } from "@/src/chess/pgn-games";

const game = (id: string, pgn: string, white = "A", black = "B", result = "1-0", date = "2020.01.01"): ParsedFileGame => ({
  id,
  white,
  black,
  result,
  date,
  event: "",
  pgn,
  title: "",
});
const G1 = '[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 1-0\n';

test("normalizes names: trim + case", () => {
  assert.equal(normalizeDatabaseName("  My Games "), "my games");
});

test("finds a conflict ignoring case and surrounding spaces", () => {
  const dbs = [{ id: "1", name: "Sicilian" }, { id: "2", name: "French" }];
  assert.equal(findNameConflict(" sicilian ", dbs)?.id, "1");
  assert.equal(findNameConflict("Caro", dbs), null);
});

test("nextFreeName picks (2), then (3), case-insensitively", () => {
  assert.equal(nextFreeName("Foo", ["Foo"]), "Foo (2)");
  assert.equal(nextFreeName("Foo", ["Foo", "foo (2)"]), "Foo (3)");
  assert.equal(nextFreeName("Foo", ["Foo", "Foo (3)"]), "Foo (2)");
});

test("duplicate key ignores header order, comments, variations and line breaks", () => {
  const a = game("a", G1);
  const b = game("b", '[Black "B"]\n[White "A"]\n[Event "x"]\n\n1. e4 {best} e5 (1... c5) 2. Nf3\n1-0');
  assert.equal(gameDuplicateKey(a), gameDuplicateKey(b));
  assert.notEqual(gameDuplicateKey(a), gameDuplicateKey(game("c", G1.replace("Nf3", "Nc3"))));
  assert.notEqual(gameDuplicateKey(a), gameDuplicateKey(game("d", G1, "A", "B", "0-1")));
});

test("merge adds only new games and counts duplicates", () => {
  const existing = [game("a", G1)];
  const incoming = [game("x", G1), game("y", G1.replace("Nf3", "Nc3")), game("z", G1.replace("Nf3", "Nc3"))];
  const merged = mergeGames(existing, incoming, 5000);
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 2);
  assert.equal(merged.overLimit, 0);
  assert.deepEqual(merged.games.map((g) => g.id), ["a", "y"]);
});

test("merge leaves new games past the limit out and counts them", () => {
  const existing = [game("a", G1)];
  const incoming = [game("n1", G1.replace("Nf3", "Nc3")), game("n2", G1.replace("Nf3", "Bc4")), game("dup", G1)];
  const merged = mergeGames(existing, incoming, 2);
  assert.equal(merged.games.length, 2);
  assert.equal(merged.added, 1);
  assert.equal(merged.overLimit, 1);
  assert.equal(merged.duplicates, 1);
});
