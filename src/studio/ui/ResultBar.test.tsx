// SIG-1308: player-perspective ResultBar uses the explorer's monochrome palette.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import { ResultBar } from "./ResultBar";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

test("player perspective uses the explorer classes, not green/red", () => {
  const { container } = render(<ResultBar perspective="player" white={5} draws={3} black={2} />);
  const cls = (key: string) => container.querySelector(`[data-segment="${key}"]`)?.className ?? "";
  assert.match(cls("win"), /bg-studio-win/);
  assert.match(cls("draws"), /bg-studio-draw/);
  assert.match(cls("loss"), /bg-studio-result-black/);
  assert.doesNotMatch(container.innerHTML, /bg-studio-success|bg-studio-danger/);
});

test("segments under 18% stay unlabeled unless a wider bar lowers the threshold", () => {
  const text = (key: string, minLabelPercent?: number) => {
    const { container } = render(<ResultBar white={47} draws={17} black={36} minLabelPercent={minLabelPercent} />);
    const value = container.querySelector(`[data-segment="${key}"]`)?.textContent;
    cleanup();
    return value;
  };
  assert.equal(text("draws"), "");
  assert.equal(text("white"), "47%");
  assert.equal(text("draws", 6), "17%");
});
