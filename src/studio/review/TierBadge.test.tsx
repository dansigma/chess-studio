// SIG-1219: every review tier has a hand-drawn SVG badge (no text glyphs).
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import { REVIEW_LABELS } from "@/src/chess/review";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { TIER_ICONS, TIER_SHAPES, TierBadge } = await import("./TierBadge.tsx");

const ALL = [...REVIEW_LABELS, "forced"] as const;

test("every ReviewLabel has an icon and a shape", () => {
  for (const label of ALL) {
    assert.ok(TIER_ICONS[label], `${label} has an icon`);
    assert.ok(TIER_SHAPES[label], `${label} has a shape`);
  }
  assert.equal(Object.keys(TIER_ICONS).length, ALL.length);
});

test("shapes follow the families: good moves circles, reference squares, errors hexagons", () => {
  assert.deepEqual(
    ALL.filter((label) => TIER_SHAPES[label] === "circle"),
    ["brilliant", "great", "best", "veryGood", "decent"],
  );
  assert.deepEqual(ALL.filter((label) => TIER_SHAPES[label] === "square").sort(), ["book", "forced"]);
  assert.deepEqual(ALL.filter((label) => TIER_SHAPES[label] === "hex"), ["inaccuracy", "mistake", "miss", "blunder"]);
});

test("badges are aria-hidden SVGs with drawn glyphs, no text, and use the tier tokens", () => {
  for (const label of ALL) {
    const { container, unmount } = render(<TierBadge label={label} size={16} />);
    const svg = container.querySelector("svg") as SVGElement;
    assert.equal(svg.getAttribute("data-tier-badge"), label);
    assert.equal(svg.getAttribute("aria-hidden"), "true");
    assert.equal(svg.getAttribute("viewBox"), "0 0 24 24");
    assert.equal(svg.textContent, "", `${label}: glyph is not text`);
    assert.equal(svg.querySelector("text"), null);
    assert.ok(svg.querySelectorAll("path, circle, polygon, rect").length >= 2, `${label}: shape plus glyph`);
    assert.match(svg.getAttribute("style") ?? "", /--studio-tier-[a-z-]+-fg/);
    assert.equal(svg.getAttribute("width"), null);
    unmount();
  }
});

test("size sets the box in px, fill takes the parent's box", () => {
  const { container } = render(
    <>
      <TierBadge label="blunder" size={20} />
      <TierBadge label="blunder" size="fill" />
    </>,
  );
  const [px, fill] = Array.from(container.querySelectorAll("svg"));
  assert.match(px.getAttribute("style") ?? "", /width:\s*20px/);
  assert.match(fill.getAttribute("style") ?? "", /width:\s*100%/);
});
