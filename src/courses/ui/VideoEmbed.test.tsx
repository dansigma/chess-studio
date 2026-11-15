import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import { VideoEmbed } from "./VideoEmbed.tsx";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

function renderUrl(url: string | null) {
  return render(<VideoEmbed url={url} title="Lesson video" />).container;
}

test("VideoEmbed renders a YouTube iframe", () => {
  try {
    const frame = renderUrl("https://youtu.be/dQw4w9WgXcQ").querySelector("iframe");
    assert.equal(frame?.getAttribute("src"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    assert.equal(frame?.getAttribute("title"), "Lesson video");
  } finally {
    cleanup();
  }
});

test("VideoEmbed renders a Vimeo iframe", () => {
  try {
    const frame = renderUrl("https://vimeo.com/123456").querySelector("iframe");
    assert.equal(frame?.getAttribute("src"), "https://player.vimeo.com/video/123456");
  } finally {
    cleanup();
  }
});

test("VideoEmbed renders a video element for files", () => {
  try {
    const container = renderUrl("https://cdn.example.com/clip.mp4");
    assert.equal(container.querySelector("video")?.getAttribute("src"), "https://cdn.example.com/clip.mp4");
    assert.equal(container.querySelector("iframe"), null);
  } finally {
    cleanup();
  }
});

test("VideoEmbed renders nothing for invalid input", () => {
  try {
    assert.equal(renderUrl("http://youtu.be/dQw4w9WgXcQ").innerHTML, "");
    assert.equal(renderUrl("https://example.com/page").innerHTML, "");
    assert.equal(renderUrl(null).innerHTML, "");
  } finally {
    cleanup();
  }
});
