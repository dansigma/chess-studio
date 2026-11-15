import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMediaLink } from "./media-link.ts";

test("empty, valid and invalid states for both kinds", () => {
  assert.deepEqual(validateMediaLink("video", "  "), { state: "empty" });
  assert.deepEqual(validateMediaLink("cover", undefined), { state: "empty" });
  const ok = validateMediaLink("video", "https://vimeo.com/123456");
  assert.ok(ok.state === "valid" && ok.kind === "video" && ok.video.kind === "vimeo");
  assert.deepEqual(validateMediaLink("video", "https://example.com/a"), {
    state: "invalid",
    errorKey: "course.admin.error.videoLink",
  });
  assert.deepEqual(validateMediaLink("cover", "http://images.unsplash.com/a.png"), {
    state: "invalid",
    errorKey: "course.admin.error.coverHost",
  });
  assert.equal(validateMediaLink("cover", "https://images.unsplash.com/a.png").state, "valid");
});
