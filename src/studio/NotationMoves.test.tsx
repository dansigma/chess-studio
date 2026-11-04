// SIG-1193: notation hierarchy by variation depth — weights, block vs inline
// variations, the "+N" pill for collapsed lines, and the table density.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { importPgn } from "@/src/chess/pgn";
import type { Path } from "@/src/chess/tree";
import { INLINE_FROM_DEPTH, Line, TableMainline, moveWeightClass, variationClass } from "./NotationMoves";
import { isPlaceholderPlayer } from "./NotationHeader";
import { pathKey } from "./notation-format";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

const PGN = `[White "Jobava London"]
[Black "Black"]

1. d4 d5 2. Nc3 Nf6 3. Bf4 e6 (3... c6 4. e3 Qb6 (4... Bf5) 5. Rb1 (5. a3 Qxb2 (5... Bf5) 6. Na4) 5... Bf5) 4. Nb5 Na6 5. e3 c6 *`;

const noop = () => undefined;

function renderLine(collapsed = new Set<string>(), onToggleCollapse: (key: string) => void = noop) {
  const game = importPgn(PGN);
  return render(
    <div>
      <Line
        nodes={game.tree.children}
        parentPath={[]}
        startFen={game.tree.startFen}
        collapsed={collapsed}
        currentPath=""
        style="english"
        density="normal"
        goPath={noop as (path: Path) => void}
        onToggleCollapse={onToggleCollapse}
        onAnnotate={noop}
        depth={0}
        locale="pt-br"
      />
    </div>,
  );
}

function moveButton(san: string, nth = 0): HTMLElement {
  const buttons = screen.getAllByRole("button").filter((button) => button.textContent === san);
  const button = buttons[nth];
  assert.ok(button, `move ${san} #${nth} rendered`);
  return button;
}

test("weights step down with depth: mainline 600, first variation 500, deeper 400", () => {
  assert.equal(moveWeightClass(0), "font-semibold");
  assert.equal(moveWeightClass(1), "font-medium");
  assert.equal(moveWeightClass(2), "font-normal");
  assert.equal(moveWeightClass(5), "font-normal");
});

test("depth-1 variations are blocks; deeper ones and compact density are inline", () => {
  assert.equal(INLINE_FROM_DEPTH, 2);
  assert.match(variationClass(1, "normal"), /basis-full/u);
  assert.match(variationClass(1, "normal"), /border-l-2/u);
  assert.match(variationClass(2, "normal"), /^inline /u);
  assert.match(variationClass(1, "compact"), /^inline /u);
});

test("the rendered tree applies the weight of each move's depth", () => {
  renderLine();
  assert.match(moveButton("d4").className, /font-semibold/u);
  assert.match(moveButton("c6").className, /font-medium/u);
  // 4... Bf5 sits inside the 3... c6 line: depth 2, inline.
  assert.match(moveButton("Bf5", 0).className, /font-normal/u);
  const subVariation = moveButton("Bf5", 0).closest("span.inline");
  assert.ok(subVariation, "depth-2 variation renders inline");
});

test("collapsing a branch replaces its variations with a +N pill that expands it", () => {
  const toggled: string[] = [];
  // The 3...e6 / 3...c6 branch hangs off 3.Bf4, the fifth mainline ply.
  const branchKey = pathKey([0, 0, 0, 0, 0]);
  renderLine(new Set([branchKey]), (key) => toggled.push(key));
  // The 3... c6 line (with 4. e3 Qb6) is hidden behind the pill.
  assert.equal(screen.queryAllByRole("button").some((button) => button.textContent === "Qb6"), false);
  const pill = screen.getByRole("button", { name: "1 variação oculta — mostrar" });
  assert.equal(pill.textContent, "+1");
  fireEvent.click(pill);
  assert.deepEqual(toggled, [branchKey]);
});

test("table density lays the mainline in rows and resumes Black with an ellipsis", () => {
  const game = importPgn(PGN);
  const { container } = render(
    <TableMainline
      nodes={game.tree.children}
      startFen={game.tree.startFen}
      collapsed={new Set()}
      currentPath=""
      style="english"
      goPath={noop as (path: Path) => void}
      onToggleCollapse={noop}
      onAnnotate={noop}
      locale="en"
    />,
  );
  const grid = container.firstElementChild as HTMLElement;
  assert.match(grid.className, /grid-cols-\[2\.25rem_minmax\(0,7\.5rem\)/u);
  // Row 3 breaks after 3.Bf4 ... e6 for the variation, so the next row of
  // move 4 starts with White again; the 3... c6 line renders as a block row.
  const text = grid.textContent ?? "";
  assert.ok(text.includes("1.d4d5"), text);
  assert.ok(text.includes("3.Bf4e6"), text);
  assert.ok(text.includes("3...c6"), text);
  assert.ok(moveButton("Nb5"));
});

test("PGN placeholders count as no player in any language", () => {
  for (const name of [undefined, "", "?", "White", "Black", "Brancas", "pretas"]) {
    assert.equal(isPlaceholderPlayer(name), true, String(name));
  }
  assert.equal(isPlaceholderPlayer("Jobava London"), false);
});

test("SIG-1219: reviewed moves carry their tier badge and a screen-reader tier name, others none", async () => {
  const { useReviewLabelsStore } = await import("@/src/store/review-labels.ts");
  const { useStudioStore } = await import("@/src/store/studio-store.ts");
  const boardId = useStudioStore.getState().active().id;
  useReviewLabelsStore.setState({ boardId, labels: new Map([["0", "blunder"], ["0.0", "best"]]) });
  try {
    const { container } = renderLine();
    const badges = Array.from(container.querySelectorAll("[data-tier-badge]"));
    assert.deepEqual(
      badges.map((badge) => badge.getAttribute("data-tier-badge")),
      ["blunder", "best"],
    );
    assert.equal(badges[0].textContent, "??");
    assert.equal(badges[1].textContent, "★");
    // The badge sits inside the move's own button (so it is part of its click target) with the tier named for screen readers.
    const first = badges[0].closest("button") as HTMLElement;
    assert.match(first.textContent ?? "", /^d4\?\?\s*Blunder$/);
    assert.equal(first.querySelector(".sr-only")?.textContent?.trim(), "Blunder");
    // Not reviewed: no badge.
    assert.equal(moveButton("Nc3").querySelector("[data-tier-badge]"), null);
    // A review belonging to another board shows nothing here.
    useReviewLabelsStore.setState({ boardId: "someone-else" });
    cleanup();
    assert.equal(renderLine().container.querySelectorAll("[data-tier-badge]").length, 0);
  } finally {
    useReviewLabelsStore.setState({ boardId: null, labels: new Map() });
  }
});
