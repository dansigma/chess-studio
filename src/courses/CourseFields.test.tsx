import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { useState } from "react";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { emptyCourse, type CourseDraft } from "./admin-draft.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { CourseInfoFields } = await import("./CourseFields.tsx");

let latest: CourseDraft = emptyCourse();

function Harness({ initial }: { initial: CourseDraft }) {
  const [draft, setDraft] = useState(initial);
  const record: typeof setDraft = (next) => {
    setDraft((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      latest = resolved;
      return resolved;
    });
  };
  return <CourseInfoFields draft={draft} setDraft={record} error={null} />;
}

function setup(patch: Partial<CourseDraft> = {}) {
  const view = render(<Harness initial={{ ...emptyCourse(), ...patch }} />);
  const input = (label: string) => view.getByLabelText(label) as HTMLInputElement;
  return { view, input };
}

test("info fields render the stored catalog values", () => {
  const { view, input } = setup({ level: "advanced", eloMin: 1200, eloMax: 1600, language: "en", durationMinutes: 150, authorName: "Ana" });
  assert.equal((view.getByLabelText("Advanced") as HTMLInputElement).checked, true);
  assert.equal(input("Minimum Elo").value, "1200");
  assert.equal(input("Maximum Elo").value, "1600");
  assert.equal(input("Hours").value, "2");
  assert.equal(input("Minutes").value, "30");
  assert.equal((view.getByLabelText("Language") as HTMLSelectElement).value, "en");
  assert.equal(input("Author name").value, "Ana");
});

test("editing the fields round-trips into the draft", () => {
  const { view, input } = setup();
  fireEvent.click(view.getByLabelText("Intermediate"));
  fireEvent.change(input("Minimum Elo"), { target: { value: "1000" } });
  fireEvent.change(input("Maximum Elo"), { target: { value: "1500" } });
  fireEvent.change(view.getByLabelText("Language"), { target: { value: "en" } });
  fireEvent.change(input("Hours"), { target: { value: "1" } });
  fireEvent.change(input("Minutes"), { target: { value: "15" } });
  assert.equal(latest.level, "intermediate");
  assert.equal(latest.eloMin, 1000);
  assert.equal(latest.eloMax, 1500);
  assert.equal(latest.language, "en");
  assert.equal(latest.durationMinutes, 75);
  fireEvent.change(input("Hours"), { target: { value: "" } });
  fireEvent.change(input("Minutes"), { target: { value: "" } });
  assert.equal(latest.durationMinutes, null);
  fireEvent.change(input("Minimum Elo"), { target: { value: "" } });
  assert.equal(latest.eloMin, null);
});

test("leaving the Elo pair with one end or a wrong order shows an error", () => {
  const { view, input } = setup();
  fireEvent.change(input("Minimum Elo"), { target: { value: "1200" } });
  fireEvent.blur(input("Minimum Elo"), { relatedTarget: input("Maximum Elo") });
  assert.equal(view.queryByRole("alert"), null);
  fireEvent.blur(input("Maximum Elo"), { relatedTarget: null });
  assert.ok(view.getByRole("alert").textContent);
  assert.equal(input("Minimum Elo").getAttribute("aria-invalid"), "true");
  fireEvent.change(input("Maximum Elo"), { target: { value: "1000" } });
  assert.match(view.getByRole("alert").textContent ?? "", /cannot be higher/);
  fireEvent.change(input("Maximum Elo"), { target: { value: "1800" } });
  assert.equal(view.queryByRole("alert"), null);
});
