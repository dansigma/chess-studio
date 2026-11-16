// SIG-1374: Treinar's Próxima variante follows course order across chapters.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextLineHref, nextStudyLine } from "./next-line.ts";

const course = {
  slug: "caro",
  chapters: [
    { variations: [{ id: "a1" }, { id: "a2" }] },
    { variations: [] },
    { variations: [{ id: "b1" }, { id: "b2" }] },
  ],
};

describe("nextLineHref", () => {
  it("opens the next line of the same chapter", () => {
    assert.equal(nextLineHref(course, "a1"), "/courses/caro/a2");
    assert.equal(nextLineHref(course, "b1"), "/courses/caro/b2");
  });

  it("skips empty chapters and opens the first line of the next chapter", () => {
    assert.equal(nextLineHref(course, "a2"), "/courses/caro/b1");
  });

  it("returns the course page after the last line", () => {
    assert.equal(nextLineHref(course, "b2"), "/courses/caro");
  });

  it("falls back to the course page for an unknown line or an empty course", () => {
    assert.equal(nextLineHref(course, "missing"), "/courses/caro");
    assert.equal(
      nextLineHref({ slug: "empty", chapters: [] }, "a1"),
      "/courses/empty",
    );
  });
});

// SIG-1386: the line a review session leads to.
describe("nextStudyLine", () => {
  const titled = {
    chapters: [
      { id: "c1", title: "Um", variations: [{ id: "a1", title: "A1" }, { id: "a2", title: "A2" }] },
      { id: "c2", title: "Dois", variations: [] },
      { id: "c3", title: "Três", variations: [{ id: "b1", title: "B1" }, { id: "b2", title: "B2" }] },
    ],
  };
  const learned = { step: 0, learned: true };

  it("returns the first line of the course that is not learned", () => {
    assert.deepEqual(nextStudyLine(titled, { a1: learned }), {
      id: "a2",
      title: "A2",
      chapterTitle: "Um",
    });
    assert.equal(nextStudyLine(titled, { a1: learned, a2: learned })?.id, "b1");
  });

  it("looks in the session's chapter first", () => {
    assert.deepEqual(nextStudyLine(titled, { b1: learned }, "c3"), {
      id: "b2",
      title: "B2",
      chapterTitle: "Três",
    });
  });

  it("falls back to the whole course once the chapter is learned", () => {
    const progress = { b1: learned, b2: learned, a1: learned };
    assert.equal(nextStudyLine(titled, progress, "c3")?.id, "a2");
    assert.equal(nextStudyLine(titled, {}, "missing")?.id, "a1");
  });

  it("returns null once every line is learned", () => {
    const all = { a1: learned, a2: learned, b1: learned, b2: learned };
    assert.equal(nextStudyLine(titled, all), null);
    assert.equal(nextStudyLine(titled, all, "c1"), null);
    assert.equal(nextStudyLine({ chapters: [] }, {}), null);
  });
});
