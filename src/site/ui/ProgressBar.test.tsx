import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar.tsx";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

test("ProgressBar exposes aria values and the label", () => {
  try {
    render(<ProgressBar value={40} label="Course progress" />);
    const bar = screen.getByRole("progressbar", { name: "Course progress" });
    assert.equal(bar.getAttribute("aria-valuenow"), "40");
    assert.equal(bar.getAttribute("aria-valuemin"), "0");
    assert.equal(bar.getAttribute("aria-valuemax"), "100");
    assert.equal((bar.firstElementChild as HTMLElement).style.width, "40%");
  } finally {
    cleanup();
  }
});

test("ProgressBar renders segments against max", () => {
  try {
    render(
      <ProgressBar
        value={5}
        max={10}
        label="Segments"
        segments={[{ value: 2 }, { value: 3, className: "bg-studio-hover" }]}
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Segments" });
    assert.equal(bar.getAttribute("aria-valuemax"), "10");
    const parts = bar.querySelectorAll<HTMLElement>("[data-segment]");
    assert.equal(parts.length, 2);
    assert.equal(parts[0].style.width, "20%");
    assert.equal(parts[1].style.width, "30%");
  } finally {
    cleanup();
  }
});
