// SIG-1197: repeated board titles get a " · n" suffix so tabs can be told apart.
import assert from "node:assert/strict";
import test from "node:test";
import { boardTitle, dedupedBoardTitles } from "./dock-api.ts";

test("dedupedBoardTitles suffixes repeats in board order and keeps unique titles", () => {
  const titles = dedupedBoardTitles("pt-br", [
    { id: "a", title: "Joe_Riau vs Skillfulness" },
    { id: "b", title: "Jobava London vs Black" },
    { id: "c", title: "Joe_Riau vs Skillfulness" },
    { id: "d", title: "" },
    { id: "e", title: "" },
  ]);
  assert.equal(titles.get("a"), "Joe_Riau vs Skillfulness");
  assert.equal(titles.get("b"), "Jobava London vs Black");
  assert.equal(titles.get("c"), "Joe_Riau vs Skillfulness · 2");
  assert.equal(titles.get("d"), "Tabuleiro");
  assert.equal(titles.get("e"), "Tabuleiro · 2");
});

test("boardTitle localizes the stored default title sentinel and keeps real titles", () => {
  assert.equal(boardTitle("pt-br", "Board"), "Tabuleiro");
  assert.equal(boardTitle("en", "Board"), "Board");
  assert.equal(boardTitle("pt-br", ""), "Tabuleiro");
  assert.equal(boardTitle("pt-br", "Jogo 1"), "Jogo 1");
});

test("dedupedBoardTitles localizes numbered default titles", () => {
  const boards = [
    { id: "a", title: "Board" },
    { id: "b", title: "Board" },
  ];
  assert.equal(dedupedBoardTitles("pt-br", boards).get("b"), "Tabuleiro · 2");
  assert.equal(dedupedBoardTitles("en", boards).get("b"), "Board · 2");
});
