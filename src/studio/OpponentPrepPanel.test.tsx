// SIG-1101: a "Prepare against" click must apply source/username even when the
// Opponent prep panel is already mounted; the first-render prefill alone drops
// the request. Mirrors the QA repro: panel open -> Prepare against -> input.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { OpponentPrepPanel, openOpponentPrepPanel } from "./OpponentPrepPanel";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

test("mounted panel: a new Prepare against request updates source and username", async () => {
  render(<OpponentPrepPanel />);
  const input = screen.getByPlaceholderText("Opponent username") as HTMLInputElement;
  const source = screen.getByLabelText("Source") as HTMLSelectElement;
  assert.equal(input.value, "");
  assert.equal(source.value, "lichess");

  await act(async () => {
    openOpponentPrepPanel({ source: "chesscom", username: "drnykterstein" });
  });

  assert.equal(input.value, "drnykterstein");
  assert.equal(source.value, "chesscom");

  cleanup();
});

test("closed panel: the pending request is applied on first mount", () => {
  openOpponentPrepPanel({ source: "lichess", username: "pre-mount" });

  render(<OpponentPrepPanel />);

  const input = screen.getByPlaceholderText("Opponent username") as HTMLInputElement;
  assert.equal(input.value, "pre-mount");

  cleanup();
});
