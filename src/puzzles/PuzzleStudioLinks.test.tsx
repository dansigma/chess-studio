import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnalyzeInStudioButton, PuzzleSourceLine } from "./PuzzleStudioLinks.tsx";

before(() => {
  setupDom();
});
after(() => {
  teardownDom();
});

test("the Analyze button renders in en and pt-BR and fires onAnalyze", () => {
  try {
    let clicks = 0;
    render(<AnalyzeInStudioButton locale="en" onAnalyze={() => (clicks += 1)} />);
    fireEvent.click(screen.getByRole("button", { name: "Analyze in Studio" }));
    assert.equal(clicks, 1);
    cleanup();
    render(<AnalyzeInStudioButton locale="pt-br" onAnalyze={() => {}} />);
    assert.ok(screen.getByRole("button", { name: "Analisar no Studio" }));
  } finally {
    cleanup();
  }
});

test("the source line links a Lichess puzzle to its training page", () => {
  try {
    render(<PuzzleSourceLine puzzleId="00sHx" locale="en" />);
    const link = screen.getByRole("link", { name: "View on Lichess" });
    assert.equal(link.getAttribute("href"), "https://lichess.org/training/00sHx");
    assert.equal(link.getAttribute("rel"), "noopener noreferrer");
    assert.match(screen.getByTestId("puzzle-source").textContent ?? "", /From a Lichess game/);
    cleanup();
    render(<PuzzleSourceLine puzzleId="00sHx" locale="pt-br" />);
    assert.match(screen.getByTestId("puzzle-source").textContent ?? "", /De uma partida do Lichess/);
  } finally {
    cleanup();
  }
});

test("the source line is hidden without a Lichess link", () => {
  try {
    render(<PuzzleSourceLine puzzleId="queen-corridor" locale="en" />);
    assert.equal(screen.queryByTestId("puzzle-source"), null);
    cleanup();
    render(<PuzzleSourceLine puzzleId="mx-h-6162" locale="en" />);
    assert.equal(screen.queryByTestId("puzzle-source"), null);
  } finally {
    cleanup();
  }
});
