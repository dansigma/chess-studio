import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outlineChapters, parseChapters } from "./catalog.ts";
import { normalizeChapters } from "./draft.ts";
import type { CourseChapter } from "./types.ts";

const line = { id: "v1", title: "Line", pgn: "1. e4 e5" };

describe("chapter video and description (SIG-1350)", () => {
  it("round-trips through normalizeChapters and parseChapters", () => {
    const input: CourseChapter[] = [
      { id: "c1", title: "A", variations: [line], videoUrl: " https://youtu.be/dQw4w9WgXcQ ", description: " Notes " },
      { id: "c2", title: "B", variations: [line], videoUrl: "", description: "" },
    ];
    const result = normalizeChapters(input);
    assert.ok("chapters" in result);
    const [a, b] = result.chapters;
    assert.equal(a?.videoUrl, "https://youtu.be/dQw4w9WgXcQ");
    assert.equal(a?.description, "Notes");
    assert.equal(a?.hasVideo, true);
    assert.ok(b && !("videoUrl" in b) && !("description" in b) && !("hasVideo" in b));
    const parsed = parseChapters(JSON.parse(JSON.stringify(result.chapters)));
    assert.deepEqual(parsed, result.chapters);
  });

  it("rejects an invalid video and an overlong description", () => {
    const bad = normalizeChapters([{ id: "c", title: "A", variations: [line], videoUrl: "https://example.com/page" }]);
    assert.deepEqual("error" in bad && bad.error.key, "course.admin.error.chapterVideoLink");
    const long = normalizeChapters([{ id: "c", title: "A", variations: [line], description: "x".repeat(2001) }]);
    assert.deepEqual("error" in long && long.error.key, "course.admin.error.chapterDescriptionTooLong");
    const ok = normalizeChapters([{ id: "c", title: "A", variations: [line], description: "x".repeat(2000) }]);
    assert.ok("chapters" in ok);
  });

  it("outlineChapters reads hasVideo and never a link", () => {
    const [a, b] = outlineChapters([
      { id: "c1", title: "A", hasVideo: true, variations: [{ id: "v1", title: "L" }] },
      { id: "c2", title: "B", variations: [] },
    ]);
    assert.equal(a?.hasVideo, true);
    assert.equal(a?.videoUrl, undefined);
    assert.ok(b && !("hasVideo" in b));
  });

  it("a course without the fields loads as before", () => {
    assert.deepEqual(parseChapters([{ id: "c", title: "A", variations: [line] }]), [
      { id: "c", title: "A", variations: [line] },
    ]);
  });
});
