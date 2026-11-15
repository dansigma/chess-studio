import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { DEFAULT_SETTINGS } from "../../store/slices/settings.ts";
import { useStudioStore } from "../../store/studio-store.ts";

before(() => {
  setupDom();
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } });
});
after(() => teardownDom());
afterEach(() => cleanup());

const { LineMarksEditor } = await import("./LineMarksEditor.tsx");

function Harness({ initial, onPgn }: { initial: string; onPgn?: (pgn: string) => void }) {
  const [pgn, setPgn] = useState(initial);
  return (
    <LineMarksEditor
      id="line-one"
      pgn={pgn}
      locale="pt-br"
      onPgn={(next) => {
        onPgn?.(next);
        setPgn(next);
      }}
    />
  );
}

function draw(from: string, to: string, init: MouseEventInit = {}) {
  const start = document.querySelector(`[data-square="${from}"]`);
  const end = document.querySelector(`[data-square="${to}"]`);
  assert.ok(start, `square ${from} rendered`);
  assert.ok(end, `square ${to} rendered`);
  fireEvent.mouseDown(start, { button: 2, ...init });
  fireEvent.mouseOver(end);
  fireEvent.mouseUp(end, { button: 2, ...init });
}

test("the last move shows the strategic plan label", () => {
  const view = render(<Harness initial="1. e4 e5" />);
  assert.ok(view.getByText("Plano estratégico"));
  fireEvent.click(view.getByRole("button", { name: "Primeiro lance" }));
  assert.equal(view.queryByText("Plano estratégico"), null);
  fireEvent.click(view.getByRole("button", { name: "Último lance" }));
  assert.ok(view.getByText("Plano estratégico"));
});

test("clicking a move shows that position", () => {
  const view = render(<Harness initial="1. e4 e5 2. Nf3" />);
  const move = view.getByRole("button", { name: /e5/ });
  fireEvent.click(move);
  assert.equal(move.getAttribute("aria-current"), "step");
  assert.equal(view.queryByText("Plano estratégico"), null);
  assert.ok(document.querySelector('[data-square="e5"]'));
});

test("right-click dragging an arrow writes [%cal] and drawing it again removes it", () => {
  const calls: string[] = [];
  render(<Harness initial="1. e4 e5" onPgn={(pgn) => calls.push(pgn)} />);
  draw("e7", "e5");
  assert.match(calls.at(-1) ?? "", /\[%cal Ge7e5\]/);
  draw("e7", "e5");
  assert.doesNotMatch(calls.at(-1) ?? "", /\[%cal/);
});

test("right-clicking one square highlights it, and modifier keys change the color", () => {
  const calls: string[] = [];
  render(<Harness initial="1. e4 e5" onPgn={(pgn) => calls.push(pgn)} />);
  draw("e5", "e5");
  assert.match(calls.at(-1) ?? "", /\[%csl Ge5\]/);
  draw("d6", "d5", { ctrlKey: true });
  assert.match(calls.at(-1) ?? "", /Rd6d5/);
  draw("c6", "c5", { shiftKey: true });
  assert.match(calls.at(-1) ?? "", /Yc6c5/);
});

test("clearing the marks of the current move keeps the comment text", () => {
  const calls: string[] = [];
  const view = render(
    <Harness initial="1. e4 {Rei} e5 {[%cal Ge7e5] Simétrica}" onPgn={(pgn) => calls.push(pgn)} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Limpar marcações" }));
  const next = calls.at(-1) ?? "";
  assert.doesNotMatch(next, /\[%cal/);
  assert.match(next, /Simétrica/);
  assert.match(next, /Rei/);
});
