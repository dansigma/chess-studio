import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Chess } from "chess.js";
import { SCENARIOS, inputFor } from "@/src/chess/explain/fixtures";
import { moveNumberForPath } from "@/src/chess/tree";
import type { ReviewMoveRow } from "./useGameReview";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { WhyBody } = await import("./WhyBlock.tsx");
const { useStudioStore } = await import("@/src/store/studio-store");
const { emptyBoard } = await import("@/src/store/slices/board-helpers");

const store = () => useStudioStore.getState();

function makeForkProps() {
  const input = inputFor(SCENARIOS.forkAllowed);
  const after = new Chess(input.fenBefore);
  const played = after.move({
    from: input.playedUci.slice(0, 2),
    to: input.playedUci.slice(2, 4),
    promotion: input.playedUci[4],
  });
  const row: ReviewMoveRow = {
    index: 6,
    path: [0, 0, 0, 0, 0, 0, 0],
    side: "w",
    san: played.san,
    playedUci: input.playedUci,
    bestPv: input.bestPv,
    beforePawns: 0.4,
    afterPawns: -2.5,
    lossCp: 290,
    winLoss: 0.35,
    accuracy: 20,
    label: "blunder",
    phase: "opening",
    forced: false,
  };
  return {
    row,
    startFen: new Chess().fen(),
    fenBefore: input.fenBefore,
    fenAfter: after.fen(),
    previous: null,
  };
}

beforeEach(() => {
  useStudioStore.setState({
    boards: [emptyBoard("Why", "why-board")],
    activeBoardId: "why-board",
    setupMode: false,
    insightMarks: null,
    enginePreview: null,
  });
});

test("statement bullets pin on click, survive mouseleave, and unpin on second click", () => {
  const base = makeForkProps();
  render(<WhyBody {...base} locale="en" moveNotation="english" onPlayLine={() => {}} />);
  const bullets = document.querySelectorAll("ul button");
  assert.ok(bullets.length >= 2);
  const first = bullets[0] as HTMLButtonElement;
  const second = bullets[1] as HTMLButtonElement;

  fireEvent.mouseEnter(first);
  fireEvent.click(first);
  assert.equal(first.getAttribute("aria-pressed"), "true");
  const pinnedMarks = store().insightMarks;
  assert.ok(pinnedMarks);

  fireEvent.mouseLeave(first);
  assert.equal(first.getAttribute("aria-pressed"), "true");
  assert.deepEqual(store().insightMarks, pinnedMarks);

  // Hovering another bullet previews it; leaving reverts to pinned.
  fireEvent.mouseEnter(second);
  fireEvent.mouseLeave(second);
  assert.deepEqual(store().insightMarks, pinnedMarks);

  // Second click unpins and clears marks immediately.
  fireEvent.mouseEnter(first);
  fireEvent.click(first);
  assert.equal(first.getAttribute("aria-pressed"), "false");
  assert.equal(store().insightMarks, null);
});

test("external enginePreview clear drops a pinned before-statement instead of re-claiming in a loop", () => {
  const base = makeForkProps();
  render(<WhyBody {...base} locale="en" moveNotation="english" onPlayLine={() => {}} />);
  // The alternative section ("Ng5 was stronger...") uses at: "before".
  const bullets = Array.from(document.querySelectorAll("ul button")) as HTMLButtonElement[];
  const beforeButton = bullets[bullets.length - 1];
  assert.ok(beforeButton);

  fireEvent.click(beforeButton);
  assert.equal(beforeButton.getAttribute("aria-pressed"), "true");
  assert.equal(store().enginePreview?.fen, base.fenBefore);
  assert.equal(store().insightMarks?.fen, base.fenBefore);

  // Simulate BoardPanel clearing enginePreview on board click.
  act(() => {
    store().setEnginePreview(null);
  });
  assert.equal(beforeButton.getAttribute("aria-pressed"), "false");
  assert.equal(store().enginePreview, null);
  assert.equal(store().insightMarks, null);
});

test("move numbers in the best line and retry label use startFen and moveNumberForPath", () => {
  // Position after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 (startFen is at fullmove 24, Black to move).
  const base = makeForkProps();
  const customStartFen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 24";
  const row: ReviewMoveRow = {
    ...base.row,
    path: [0, 0], // ply 1 = Black (24), ply 2 = White (25)
    side: "w",
  };
  const expectedMove = moveNumberForPath(customStartFen, row.path.length);
  assert.equal(expectedMove, 25);

  render(
    <WhyBody
      row={row}
      startFen={customStartFen}
      fenBefore={base.fenBefore}
      fenAfter={base.fenAfter}
      previous={null}
      locale="en"
      moveNotation="english"
      onPlayLine={() => {}}
      onRetry={() => {}}
    />,
  );
  assert.ok(screen.getByText("25."));
  assert.ok(screen.getByRole("button", { name: `Retry move ${expectedMove}, Qe2` }));
});
