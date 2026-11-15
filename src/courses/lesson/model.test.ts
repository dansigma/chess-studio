import assert from "node:assert/strict";
import { test } from "node:test";
import { chapterSegments, lastReachedStep, lessonShortcut } from "./model.ts";

const chapter = {
  variations: [{ id: "a" }, { id: "b" }, { id: "c" }],
} as never;

test("chapterSegments marks learned and current lines", () => {
  const segs = chapterSegments(
    chapter,
    { a: { step: 4, learned: true }, b: { step: 1, learned: false } },
    "b",
  );
  assert.deepEqual(
    segs.map((s) => [s.id, s.index, s.learned, s.current]),
    [
      ["a", 1, true, false],
      ["b", 2, false, true],
      ["c", 3, false, false],
    ],
  );
});

test("lastReachedStep never goes past the reached frame", () => {
  assert.equal(lastReachedStep(3, false, 10), 3);
  assert.equal(lastReachedStep(30, false, 10), 9);
  assert.equal(lastReachedStep(0, false, 0), 0);
  assert.equal(lastReachedStep(3, true, 10), 9);
});

test("lessonShortcut maps keys and ignores inputs and modifiers", () => {
  assert.equal(lessonShortcut({ key: "End" }), "end");
  assert.equal(lessonShortcut({ key: "F" }), "flip");
  assert.equal(lessonShortcut({ key: "?" }), "help");
  // SIG-1374: Space / Enter press the summary's primary button.
  assert.equal(lessonShortcut({ key: " " }), "primary");
  assert.equal(lessonShortcut({ key: "Enter" }), "primary");
  assert.equal(lessonShortcut({ key: "x" }), null);
  assert.equal(lessonShortcut({ key: "f", ctrlKey: true }), null);
  assert.equal(lessonShortcut({ key: "ArrowLeft", metaKey: true }), null);
  assert.equal(
    lessonShortcut({ key: "f", target: { tagName: "INPUT" } as never }),
    null,
  );
  assert.equal(
    lessonShortcut({ key: "f", target: { tagName: "TEXTAREA" } as never }),
    null,
  );
  assert.equal(
    lessonShortcut({ key: "Enter", target: { tagName: "BUTTON" } as never }),
    null,
  );
  assert.equal(
    lessonShortcut({ key: " ", target: { tagName: "A" } as never }),
    null,
  );
  assert.equal(
    lessonShortcut({
      key: "f",
      target: { tagName: "DIV", isContentEditable: true } as never,
    }),
    null,
  );
});

test("lessonShortcut is inert while the shortcuts dialog is open", () => {
  for (const key of ["Home", "ArrowLeft", "ArrowRight", "End", "f", "?"]) {
    assert.notEqual(lessonShortcut({ key }), null);
    assert.equal(lessonShortcut({ key }, { dialogOpen: true }), null);
  }
});
