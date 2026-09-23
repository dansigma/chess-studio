import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyTree, playMove } from "./tree.ts";
import { printDocumentHtml, printNotationText, printTokens } from "./print-sheet.ts";

function move(san: string, uci: string, fen: string) {
  return { san, uci, fen, from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

test("notation includes the variation and marks the current move", () => {
  let tree = createEmptyTree();
  const e4 = playMove(tree, [], move("e4", "e2e4", "fen-e4"));
  tree = e4.tree;
  const e5 = playMove(tree, e4.path, move("e5", "e7e5", "fen-e5"));
  tree = e5.tree;
  const c5 = playMove(tree, e4.path, move("c5", "c7c5", "fen-c5"));
  tree = c5.tree;
  const nf3 = playMove(tree, e5.path, move("Nf3", "g1f3", "fen-nf3"));
  tree = nf3.tree;

  const tokens = printTokens(tree, e5.path, "english");
  const text = printNotationText(tokens);
  assert.match(text, /1\. e4 e5/);
  assert.match(text, /\(1\.\.\. c5\)/);
  assert.match(text, /2\. Nf3/);
  assert.deepEqual(
    tokens.filter((token) => token.current).map((token) => token.text),
    ["e5"],
  );
});

test("the print page embeds the board and escapes the title", () => {
  const html = printDocumentHtml({
    title: "A < B",
    tokens: [{ text: "e4", current: true }],
    imageDataUrl: "data:image/png;base64,abc",
  });
  assert.match(html, /A &lt; B/);
  assert.match(html, /data:image\/png;base64,abc/);
  assert.match(html, /<strong>e4<\/strong>/);
});
