import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseCoverUrl, courseImageUrl, courseVideo } from "./media.ts";

describe("course media", () => {
  it("keeps an https image and drops anything else", () => {
    assert.equal(courseImageUrl("https://cdn.example.com/caro.png"), "https://cdn.example.com/caro.png");
    assert.equal(courseImageUrl("  "), null);
    assert.equal(courseImageUrl("http://cdn.example.com/caro.png"), null);
    assert.equal(courseImageUrl("javascript:alert(1)"), null);
  });

  it("restricts publish-time covers to an allowlisted host", () => {
    assert.equal(courseCoverUrl("https://images.unsplash.com/photo-123"), "https://images.unsplash.com/photo-123");
    assert.equal(courseCoverUrl("https://evil.example/caro.png"), null);
    assert.equal(courseImageUrl("https://evil.example/caro.png"), "https://evil.example/caro.png");
    assert.equal(courseCoverUrl("http://images.unsplash.com/photo-123"), null);
    assert.equal(courseCoverUrl("javascript:alert(1)"), null);
  });

  it("turns a YouTube or Vimeo link into an embed and accepts a video file", () => {
    assert.equal(
      courseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.src,
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    assert.equal(
      courseVideo("https://youtu.be/dQw4w9WgXcQ")?.src,
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    assert.equal(courseVideo("https://vimeo.com/123456789")?.src, "https://player.vimeo.com/video/123456789");
    assert.equal(courseVideo("https://cdn.example.com/intro.mp4")?.kind, "file");
    assert.equal(courseVideo("https://example.com/not-a-video"), null);
  });
});
