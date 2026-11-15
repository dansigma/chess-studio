import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { useState } from "react";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "../store/slices/settings.ts";
import { useStudioStore } from "../store/studio-store.ts";
import type { CourseChapter } from "./types.ts";

before(() => {
  setupDom();
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en" } });
});
after(() => teardownDom());
afterEach(() => cleanup());

const { ChapterDraft } = await import("./ChapterDraft.tsx");

type Calls = {
  moves: number[];
  reorders: Array<[number, number]>;
  duplicates: string[];
  removes: string[];
  lineMoves: Array<[number, number]>;
  lineReorders: Array<[number, number]>;
  lineDuplicates: string[];
  lineRemoves: string[];
};

function makeCalls(): Calls {
  return {
    moves: [],
    reorders: [],
    duplicates: [],
    removes: [],
    lineMoves: [],
    lineReorders: [],
    lineDuplicates: [],
    lineRemoves: [],
  };
}

const chapter: CourseChapter = {
  id: "c1",
  title: "Openings",
  description: "",
  variations: [
    { id: "v1", title: "Line one", pgn: "1. e4 e5" },
    { id: "v2", title: "Line two", pgn: "1. d4 d5 2. c4" },
  ],
};

function Harness({ calls }: { calls: Calls }) {
  const [current, setCurrent] = useState(chapter);
  return (
    <ChapterDraft
      chapter={current}
      index={0}
      total={1}
      error={null}
      onTitle={(title) => setCurrent((value) => ({ ...value, title }))}
      onDescription={(description) => setCurrent((value) => ({ ...value, description }))}
      onVideo={(videoUrl) => setCurrent((value) => ({ ...value, videoUrl }))}
      onMove={(direction) => calls.moves.push(direction)}
      onReorder={(from, to) => calls.reorders.push([from, to])}
      onDuplicate={() => calls.duplicates.push("chapter")}
      onRemove={() => calls.removes.push("chapter")}
      onUpload={() => {}}
      onAddLine={() => {}}
      onVariationTitle={(variationId, title) =>
        setCurrent((value) => ({
          ...value,
          variations: value.variations.map((variation) =>
            variation.id === variationId ? { ...variation, title } : variation,
          ),
        }))
      }
      onVariationPgn={(variationId, pgn) =>
        setCurrent((value) => ({
          ...value,
          variations: value.variations.map((variation) =>
            variation.id === variationId ? { ...variation, pgn } : variation,
          ),
        }))
      }
      onMoveVariation={(index, direction) => calls.lineMoves.push([index, direction])}
      onReorderVariation={(from, to) => calls.lineReorders.push([from, to])}
      onDuplicateVariation={(variationId) => calls.lineDuplicates.push(variationId)}
      onRemoveVariation={(variationId) => calls.lineRemoves.push(variationId)}
    />
  );
}

function setup() {
  const calls = makeCalls();
  const view = render(<Harness calls={calls} />);
  return { calls, view };
}

test("a chapter collapses to its title and line count", () => {
  const { view } = setup();
  assert.ok(view.getByDisplayValue("1. e4 e5"));
  fireEvent.click(view.getByRole("button", { name: "Collapse chapter" }));
  assert.equal(view.queryByDisplayValue("1. e4 e5"), null);
  assert.equal(view.queryByDisplayValue("1. d4 d5 2. c4"), null);
  assert.ok(view.getByText("Openings"));
  assert.ok(view.getByText("2 lines"));
  fireEvent.click(view.getByRole("button", { name: "Expand chapter" }));
  assert.ok(view.getByDisplayValue("1. e4 e5"));
});

test("a line collapses to its title and move count", () => {
  const { view } = setup();
  fireEvent.click(view.getAllByRole("button", { name: "Collapse line" })[0] as HTMLElement);
  assert.equal(view.queryByDisplayValue("1. e4 e5"), null);
  assert.ok(view.getByText("Line one"));
  assert.ok(view.getByText("2 moves"));
  fireEvent.click(view.getAllByRole("button", { name: "Expand line" })[0] as HTMLElement);
  assert.ok(view.getByDisplayValue("1. e4 e5"));
});

test("the reorder handles move one step with the arrow keys", () => {
  const { calls, view } = setup();
  fireEvent.keyDown(view.getByRole("button", { name: "Reorder chapter" }), { key: "ArrowDown" });
  const lineHandles = view.getAllByRole("button", { name: "Reorder line" });
  fireEvent.keyDown(lineHandles[0] as HTMLElement, { key: "ArrowDown" });
  fireEvent.keyDown(lineHandles[1] as HTMLElement, { key: "ArrowUp" });
  assert.deepEqual(calls.moves, [1]);
  assert.deepEqual(calls.lineMoves, [
    [0, 1],
    [1, -1],
  ]);
});

test("duplicate asks for a chapter copy and a line copy", () => {
  const { calls, view } = setup();
  fireEvent.click(view.getByRole("button", { name: "Duplicate chapter" }));
  fireEvent.click(view.getAllByRole("button", { name: "Duplicate line" })[0] as HTMLElement);
  assert.equal(calls.duplicates.length, 1);
  assert.deepEqual(calls.lineDuplicates, ["v1"]);
});

test("the chapter description counts characters up to 2000", () => {
  const { view } = setup();
  const description = view.getByLabelText("Chapter description") as HTMLTextAreaElement;
  assert.equal(description.maxLength, 2000);
  fireEvent.change(description, { target: { value: "abc" } });
  assert.equal(description.value, "abc");
  assert.ok(view.getByText("3/2,000"));
});

test("an illegal PGN shows its first problem after the field loses focus", () => {
  const { view } = setup();
  const pgn = view.getByDisplayValue("1. e4 e5") as HTMLTextAreaElement;
  fireEvent.change(pgn, { target: { value: "1. e4 e5 2. e5" } });
  fireEvent.blur(pgn);
  assert.match(view.getByRole("alert").textContent ?? "", /Illegal move “e5” skipped/);
});

test("drawing on the line board writes the marks into the PGN text box", () => {
  const { view } = setup();
  const pgn = view.getByDisplayValue("1. e4 e5") as HTMLTextAreaElement;
  const line = pgn.parentElement as HTMLElement;
  const start = line.querySelector('[data-square="e2"]');
  const end = line.querySelector('[data-square="e4"]');
  assert.ok(start);
  assert.ok(end);
  fireEvent.mouseDown(start, { button: 2 });
  fireEvent.mouseUp(end, { button: 2 });
  assert.match(pgn.value, /\[%cal Ge2e4\]/);
});

test("collapsing a line unmounts its board", () => {
  const { view } = setup();
  assert.equal(view.getAllByText("Strategic plan").length, 2);
  fireEvent.click(view.getAllByRole("button", { name: "Collapse line" })[0] as HTMLElement);
  assert.equal(view.getAllByText("Strategic plan").length, 1);
});
