// SIG-1365: the media link field validates live and previews what the student sees.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render } from "@testing-library/react";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { MediaLinkField } = await import("./MediaLinkField.tsx");

function field(kind: "cover" | "video", value: string, onRemove?: () => void) {
  return (
    <MediaLinkField
      kind={kind}
      field={kind === "cover" ? "coverUrl" : "videoUrl"}
      label="Link"
      value={value}
      onChange={() => {}}
      onRemove={onRemove}
      error={null}
      debounceMs={0}
    />
  );
}

test("an empty link shows no preview and no error", () => {
  const { container } = render(field("video", ""));
  assert.equal(container.querySelector("iframe, video, img, [role=alert]"), null);
});

test("a valid video link shows the player", () => {
  const { container } = render(field("video", "https://youtu.be/dQw4w9WgXcQ"));
  assert.ok(container.querySelector("iframe"));
  assert.equal(container.querySelector("[role=alert]"), null);
});

test("a valid cover link shows an image preview", () => {
  const { container } = render(field("cover", "https://images.unsplash.com/photo-1"));
  assert.equal(container.querySelector("img")?.getAttribute("src"), "https://images.unsplash.com/photo-1");
});

test("an invalid link shows the message right away and no preview", () => {
  const { container } = render(field("video", "https://example.com/page"));
  assert.match(container.querySelector("[role=alert]")?.textContent ?? "", /Link inválido|Invalid link/);
  assert.equal(container.querySelector("iframe, video"), null);
  assert.equal(container.querySelector("input")?.getAttribute("aria-invalid"), "true");
  const cover = render(field("cover", "https://evil.example/x.png"));
  assert.ok(cover.container.querySelector("[role=alert]"));
  assert.equal(cover.container.querySelector("img"), null);
});

test("Remover appears with a value and calls onRemove", () => {
  let removed = 0;
  const { getByRole, rerender, container } = render(field("video", "https://youtu.be/dQw4w9WgXcQ", () => removed++));
  fireEvent.click(getByRole("button"));
  assert.equal(removed, 1);
  rerender(field("video", "", () => removed++));
  assert.equal(container.querySelector("button"), null);
});
