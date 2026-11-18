import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlayerCombobox } from "./PlayerCombobox.tsx";

const PLAYERS = [
  { id: 1503014, name: "Carlsen, Magnus", federation: "NOR", title: "GM", rating: 2831 },
  { id: 2020009, name: "Caruana, Fabiano", federation: "USA", title: "GM", rating: 2805 },
];

const originalFetch = globalThis.fetch;

before(() => setupDom());
after(async () => {
  globalThis.fetch = originalFetch;
  await teardownDom();
});

beforeEach(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ players: PLAYERS }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
});

afterEach(() => {
  cleanup();
});

async function openSuggestions(initialRect = { left: 100, bottom: 200, width: 220 }) {
  let value = "Car";
  const picked: string[] = [];
  let rect = { ...initialRect, top: initialRect.bottom - 32, right: initialRect.left + initialRect.width, height: 32 };

  const view = render(
    <div style={{ overflow: "hidden" }}>
      <PlayerCombobox
        value={value}
        onChange={(next) => {
          value = next;
          view.rerender(
            <div style={{ overflow: "hidden" }}>
              <PlayerCombobox
                value={value}
                onChange={(v) => {
                  value = v;
                }}
                onPick={(s) => picked.push(s.name)}
              />
            </div>,
          );
        }}
        onPick={(s) => picked.push(s.name)}
      />
    </div>,
  );

  const input = screen.getByRole("combobox") as HTMLInputElement;
  input.getBoundingClientRect = () => rect as DOMRect;

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  return {
    view,
    input,
    picked,
    getValue: () => value,
    setRect: (next: typeof initialRect) => {
      rect = { ...next, top: next.bottom - 32, right: next.left + next.width, height: 32 };
    },
  };
}

test("PlayerCombobox portals listbox to document.body with fixed positioning and ARIA wiring", async () => {
  const { view, input, setRect } = await openSuggestions();
  const listbox = screen.getByRole("listbox");
  assert.equal(listbox.parentElement, document.body);
  assert.equal(view.container.contains(listbox), false);
  assert.match(listbox.className, /\bfixed\b/);
  assert.match(listbox.className, /z-\[1200\]/);
  assert.equal(input.getAttribute("aria-expanded"), "true");
  assert.equal(input.getAttribute("aria-controls"), listbox.id);
  assert.equal(listbox.style.top, "204px");
  assert.equal(listbox.style.left, "100px");
  assert.equal(listbox.style.width, "220px");

  // Scroll and resize update fixed position from input rect.
  setRect({ left: 120, bottom: 160, width: 240 });
  fireEvent.scroll(window);
  assert.equal(listbox.style.top, "164px");
  assert.equal(listbox.style.left, "120px");
  assert.equal(listbox.style.width, "240px");

  setRect({ left: 80, bottom: 140, width: 200 });
  fireEvent.resize(window);
  assert.equal(listbox.style.top, "144px");
  assert.equal(listbox.style.left, "80px");
  assert.equal(listbox.style.width, "200px");
});

test("PlayerCombobox selects via keyboard ArrowDown + Enter", async () => {
  const { input, picked, getValue } = await openSuggestions();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  const options = screen.getAllByRole("option");
  assert.equal(input.getAttribute("aria-activedescendant"), options[0]!.id);
  assert.equal(options[0]!.getAttribute("aria-selected"), "true");

  fireEvent.keyDown(input, { key: "ArrowDown" });
  assert.equal(input.getAttribute("aria-activedescendant"), options[1]!.id);

  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(getValue(), "Caruana, Fabiano");
  assert.deepEqual(picked, ["Caruana, Fabiano"]);
  assert.equal(screen.queryByRole("listbox"), null);
});

test("PlayerCombobox selects via mouseDown and keeps list open on non-option inside click, closes on outside click", async () => {
  await openSuggestions();
  const listbox = screen.getByRole("listbox");

  // Clicking inside the portaled listbox container itself does not count as outside.
  fireEvent.mouseDown(listbox);
  assert.ok(screen.getByRole("listbox"));

  // Selecting an option via mouseDown picks it and closes the list.
  const firstOption = screen.getAllByRole("option")[0]!;
  fireEvent.mouseDown(firstOption);
  assert.equal(screen.queryByRole("listbox"), null);
});

test("PlayerCombobox closes on outside mousedown", async () => {
  await openSuggestions();
  assert.ok(screen.getByRole("listbox"));
  fireEvent.mouseDown(document.body);
  assert.equal(screen.queryByRole("listbox"), null);
});
