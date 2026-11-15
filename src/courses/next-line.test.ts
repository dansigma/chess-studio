// SIG-1374: Treinar's Próxima variante follows course order across chapters.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextLineHref } from "./next-line.ts";

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
