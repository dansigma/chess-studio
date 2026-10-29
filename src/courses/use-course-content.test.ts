import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseChapter } from "./types.ts";
import { contentState } from "./use-course-content.ts";

const CHAPTERS: CourseChapter[] = [{ id: "ch1", title: "One", variations: [{ id: "v1", title: "Line", pgn: "1. e4 e5" }] }];

describe("contentState", () => {
  it("starts loading with empty chapters", () => {
    const next = contentState({ status: "ready", chapters: CHAPTERS }, { type: "start" });
    assert.deepEqual(next, { status: "loading", chapters: [] });
  });

  it("resolves to ready with the gated chapters", () => {
    const next = contentState({ status: "loading", chapters: [] }, { type: "resolve", chapters: CHAPTERS });
    assert.deepEqual(next, { status: "ready", chapters: CHAPTERS });
  });

  it("denies to locked with empty chapters", () => {
    const next = contentState({ status: "loading", chapters: [] }, { type: "deny" });
    assert.deepEqual(next, { status: "locked", chapters: [] });
  });

  it("fails to error and keeps the previous chapters", () => {
    const next = contentState({ status: "loading", chapters: CHAPTERS }, { type: "fail" });
    assert.deepEqual(next, { status: "error", chapters: CHAPTERS });
  });
});
