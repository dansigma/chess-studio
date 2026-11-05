// SIG-1219: every review tier badge passes WCAG against the studio panel, in
// both themes, computed from the hex values declared in app/globals.css (the
// same check as SIG-1192). Fill vs panel >= 3:1 (non-text UI), mark vs fill
// >= 4.5:1 (text); the text colour used for tier names/marks >= 4.5:1.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REVIEW_LABELS } from "./review.ts";
import { REVIEW_TIERS } from "./review-tiers.ts";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function block(startMarker: string): string {
  const start = css.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} block exists`);
  return css.slice(start, css.indexOf("\n}", start));
}
const THEMES = {
  dark: block(":root {"),
  light: block('html[data-color-scheme="light"] {'),
};

function token(theme: string, name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(theme);
  assert.ok(match, `${name} is a hex colour`);
  return match[1];
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

for (const [themeName, theme] of Object.entries(THEMES)) {
  const panel = token(theme, "--studio-panel");
  test(`tier badges pass contrast on the ${themeName} panel`, () => {
    for (const label of [...REVIEW_LABELS, "forced"] as const) {
      const fill = token(theme, REVIEW_TIERS[label].badgeVar);
      const mark = token(theme, `${REVIEW_TIERS[label].badgeVar}-fg`);
      assert.ok(contrast(fill, panel) >= 3, `${themeName} ${label}: badge fill vs panel ${contrast(fill, panel).toFixed(2)} < 3`);
      assert.ok(contrast(mark, fill) >= 4.5, `${themeName} ${label}: mark vs badge ${contrast(mark, fill).toFixed(2)} < 4.5`);
      if (label !== "forced") {
        // The text colour of the tier is derived from the same token.
        assert.ok(contrast(fill, panel) >= 4.5, `${themeName} ${label}: tier text vs panel ${contrast(fill, panel).toFixed(2)} < 4.5`);
      }
    }
  });

  test(`tier badge fills are pairwise distinct in the ${themeName} theme`, () => {
    const fills = REVIEW_LABELS.map((label) => token(theme, REVIEW_TIERS[label].badgeVar).toLowerCase());
    assert.equal(new Set(fills).size, fills.length);
    assert.equal(new Set([...fills, token(theme, REVIEW_TIERS.forced.badgeVar).toLowerCase()]).size, fills.length + 1);
  });
}

test("REVIEW_TIERS: marks are unique per tier and the text colour class follows the token", () => {
  const marks = REVIEW_LABELS.map((label) => REVIEW_TIERS[label].mark);
  assert.equal(new Set(marks).size, marks.length, "one distinct mark per tier");
  const classes = REVIEW_LABELS.map((label) => REVIEW_TIERS[label].className);
  assert.equal(new Set(classes).size, classes.length, "no two tiers share a text colour");
  for (const label of REVIEW_LABELS) {
    assert.equal(REVIEW_TIERS[label].badgeVar.replace("--studio-tier-", "text-studio-tier-"), REVIEW_TIERS[label].className);
  }
});
