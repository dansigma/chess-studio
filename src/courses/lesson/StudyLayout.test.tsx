// SIG-1387: below `lg` the study panel caps its height, its body scrolls and
// the action row (the `footer` slot) stays outside that scroll area. Phones
// also start with the chapter video collapsed.
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

// The component reads `window.matchMedia` (happy-dom's own), which
// `setupDom({ matchMediaMatches })` does not replace, so fake it here.
const realMatchMedia = window.matchMedia;
function setPhone(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ ...realMatchMedia.call(window, query), matches, media: query }),
  });
}

after(() => teardownDom());
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: realMatchMedia,
  });
});
beforeEach(() => {
  setupDom();
  window.localStorage.clear();
});

const { StudyLayout, VIDEO_COLLAPSED_KEY } = await import("./StudyLayout.tsx");

const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function renderLayout({
  footer,
  videoUrl = undefined,
}: {
  footer?: ReactNode;
  videoUrl?: string;
} = {}) {
  return render(
    <StudyLayout
      locale="pt-br"
      board={<div data-testid="board" />}
      controls={<div data-testid="controls" />}
      videoUrl={videoUrl}
      videoTitle="Capítulo um"
      footer={footer}
    >
      <p data-testid="body">Conteúdo da linha</p>
    </StudyLayout>,
  );
}

/** The panel `<section>` and the scrolling body inside it. */
function panel(container: HTMLElement) {
  const section = container.querySelector("section");
  assert.ok(section, "the panel section renders");
  const scrolling = section.querySelector(".overflow-y-auto");
  assert.ok(scrolling, "the panel body scrolls");
  return { section, scrolling };
}

test("the footer renders outside the scrolling body, below it", () => {
  const { container } = renderLayout({
    footer: <button data-testid="footer-action">Avançar</button>,
  });
  const { section, scrolling } = panel(container);
  const action = container.querySelector("[data-testid=footer-action]");
  assert.ok(action, "the footer action renders");
  assert.equal(scrolling.contains(action), false);
  assert.equal(section.contains(action), true);
  const wrapper = action.parentElement;
  assert.ok(wrapper);
  assert.equal(wrapper.className, "shrink-0 border-t border-studio-border p-3");
  // The body keeps scrolling; the footer sits after it inside the section.
  assert.equal(wrapper.parentElement, section);
  assert.equal(scrolling.compareDocumentPosition(action) & 4, 4);
  assert.equal(container.querySelector("[data-testid=body]")?.parentElement, scrolling);
});

test("the panel is height-capped below lg so only its body scrolls", () => {
  const { container } = renderLayout();
  const { section } = panel(container);
  assert.match(section.className, /(^|\s)max-lg:max-h-\[45dvh\](\s|$)/);
  assert.match(section.className, /(^|\s)min-h-36(\s|$)/);
  // Desktop keeps its own cap.
  assert.match(section.className, /(^|\s)lg:max-h-\[calc\(100dvh-8rem\)\](\s|$)/);
});

test("without a footer no footer wrapper is rendered", () => {
  const { container } = renderLayout();
  const { section } = panel(container);
  // controls + scrolling body, nothing else.
  assert.equal(section.children.length, 2);
});

test("the video starts collapsed on a phone when nothing is stored", () => {
  setPhone(true);
  const { container } = renderLayout({ videoUrl: VIDEO_URL });
  assert.equal(container.querySelector("iframe") === null, true);
  const toggle = container.querySelector("button[aria-expanded]");
  assert.ok(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(window.localStorage.getItem(VIDEO_COLLAPSED_KEY), null);
});

test("the video starts expanded on desktop when nothing is stored", () => {
  setPhone(false);
  const { container } = renderLayout({ videoUrl: VIDEO_URL });
  assert.ok(container.querySelector("iframe"));
  const toggle = container.querySelector("button[aria-expanded]");
  assert.ok(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
});

test("a stored expanded choice wins over the phone default", () => {
  setPhone(true);
  window.localStorage.setItem(VIDEO_COLLAPSED_KEY, "0");
  const { container } = renderLayout({ videoUrl: VIDEO_URL });
  assert.ok(container.querySelector("iframe"));
  const toggle = container.querySelector("button[aria-expanded]");
  assert.ok(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
});

test("a stored collapsed choice wins on desktop too", () => {
  setPhone(false);
  window.localStorage.setItem(VIDEO_COLLAPSED_KEY, "1");
  const { container } = renderLayout({ videoUrl: VIDEO_URL });
  assert.equal(container.querySelector("iframe") === null, true);
  const toggle = container.querySelector("button[aria-expanded]");
  assert.ok(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});
