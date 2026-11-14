// SIG-1330: ECO badge family mapping and rendering.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import { EcoBadge, ecoFamily } from "./EcoBadge";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

test("ecoFamily maps valid codes to their letter", () => {
  for (const f of ["A", "B", "C", "D", "E"] as const) assert.equal(ecoFamily(`${f}45`), f);
});

test("ecoFamily accepts lower-case and padded codes", () => {
  assert.equal(ecoFamily("c20"), "C");
  assert.equal(ecoFamily(" e04 "), "E");
});

test("ecoFamily returns null for blank, '?', unknown and missing codes", () => {
  for (const v of ["", "  ", "?", "Z99", "99", null, undefined]) assert.equal(ecoFamily(v), null);
});

test("badge shows a family colour class and the upper-cased code", () => {
  const { container } = render(<EcoBadge code="b12" />);
  const el = container.querySelector("span")!;
  assert.equal(el.textContent, "B12");
  assert.match(el.className, /text-studio-eco-b/);
  assert.match(el.className, /tabular-nums/);
});

test("invalid code renders a neutral dash", () => {
  for (const code of ["", "?", null]) {
    const { container, unmount } = render(<EcoBadge code={code} />);
    const el = container.querySelector("span")!;
    assert.equal(el.textContent, "—");
    assert.match(el.className, /text-studio-faint/);
    assert.doesNotMatch(el.className, /text-studio-eco-/);
    unmount();
  }
});

test("opening name becomes the tooltip, absent otherwise", () => {
  const { container, rerender } = render(<EcoBadge code="C60" opening="Ruy Lopez" />);
  assert.equal(container.querySelector("span")!.getAttribute("title"), "Ruy Lopez");
  rerender(<EcoBadge code="C60" />);
  assert.equal(container.querySelector("span")!.hasAttribute("title"), false);
});
