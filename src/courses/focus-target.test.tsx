import assert from "node:assert/strict";
import { test } from "node:test";
import { focusTargetId } from "./FieldError.tsx";
import { type CourseField } from "./validate-draft.ts";

const ALL_FIELDS: Record<CourseField, true> = {
  title: true,
  slug: true,
  theme: true,
  color: true,
  authorName: true,
  level: true,
  language: true,
  elo: true,
  duration: true,
  summary: true,
  coverUrl: true,
  videoUrl: true,
  chapters: true,
};

test("every course field has a distinct focus target id", () => {
  const ids = (Object.keys(ALL_FIELDS) as CourseField[]).map(focusTargetId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.match(id, /^course-field-[a-zA-Z]+$/);
  }
});
