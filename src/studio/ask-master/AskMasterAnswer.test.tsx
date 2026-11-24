import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { teardownDom } from "@/src/test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { AskMasterAnswer } from "./AskMasterAnswer.tsx";

afterEach(() => cleanup());
test.after(() => teardownDom());

const fen = "rn1qkb1r/pp2pppp/5n2/2pp1b2/3P1B2/2N1PP2/PPP3PP/R2QKBNR b KQkq - 0 5";
const source = { boardId: "other-board", path: [], currentFen: fen, lineFens: [fen], lineStartPly: 9 };

test("a heading written on the same line as its text keeps only the title as heading", () => {
  const text = [
    "### Conclusão — Para as pretas, a jogada mais popular é **e6**, preparando o desenvolvimento.",
    "",
    "### Linha principal — [[5...e6 6.g4]] mostra o plano.",
    "",
    "### Na prática: Fique atento a Qb6.",
    "",
    "### O plano",
    "Rocar curto.",
  ].join("\n");
  const { container } = render(<AskMasterAnswer text={text} source={source} locale="pt-br" />);
  const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);
  assert.deepEqual(headings, ["Conclusão", "Linha principal", "Na prática", "O plano"]);
  assert.equal(container.querySelector("strong")?.textContent, "e6");
  assert.doesNotMatch(container.textContent ?? "", /\*\*|\[\[|\]\]/);
  assert.match(container.textContent ?? "", /Fique atento a Qb6\./);
  assert.match(container.textContent ?? "", /Rocar curto\./);
});
