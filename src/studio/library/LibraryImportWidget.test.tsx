import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AUTO_DISMISS_MS, LibraryImportWidget, isCleanlyFinished } from "./LibraryImportWidget";
import { resetImportQueue, useImportQueue, type ImportEntry } from "./import-queue-store";
import { useStudioStore } from "@/src/store/studio-store";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  resetImportQueue();
  useStudioStore.setState({ settings: { ...useStudioStore.getState().settings, locale: "en" } });
});

const entry = (over: Partial<ImportEntry>): ImportEntry => ({ id: over.name ?? "x", name: "f.pgn", state: "waiting", done: 0, total: 0, ...over });
const show = (entries: ImportEntry[]) => {
  useImportQueue.setState({ entries });
  return act(async () => { render(<LibraryImportWidget />); });
};

test("renders nothing without entries", async () => {
  await show([]);
  assert.equal(screen.queryByTestId("library-import-widget"), null);
});

test("each file shows its state, progress and a Cancel button; no close while active", async () => {
  await show([
    entry({ id: "1", name: "a.pgn", state: "importing", done: 1200, total: 4000 }),
    entry({ id: "2", name: "b.pgn", state: "waiting" }),
  ]);
  const widget = screen.getByTestId("library-import-widget");
  assert.equal(widget.getAttribute("role"), "status");
  assert.equal(widget.getAttribute("aria-live"), "polite");
  assert.match(widget.textContent ?? "", /1,200 \/ 4,000 games/);
  assert.equal(screen.getAllByRole("button", { name: "Cancel" }).length, 2);
  assert.equal(screen.queryByRole("button", { name: "Close" }), null);
  await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[1]); });
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.name), ["a.pgn"]);
});

test("finished states, over-limit and unreadable counts, and the close button", async () => {
  await show([
    entry({ id: "1", name: "a.pgn", state: "done", imported: 5000, overLimit: 1240, unreadable: 3 }),
    entry({ id: "2", name: "b.pgn", state: "failed", error: "database-limit" }),
    entry({ id: "3", name: "c.pgn", state: "cancelled" }),
  ]);
  const text = screen.getByTestId("library-import-widget").textContent ?? "";
  assert.match(text, /5,000 imported, 1,240 over the 5,000-per-database limit/);
  assert.match(text, /3 could not be read/);
  assert.match(text, /50-database limit reached\. Delete a database to import another\./);
  assert.match(text, /Cancelled/);
  assert.equal(screen.queryByRole("button", { name: "Cancel" }), null);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Close" })); });
  assert.equal(screen.queryByTestId("library-import-widget"), null);
});

test("pt-BR strings and number formatting", async () => {
  useStudioStore.setState({ settings: { ...useStudioStore.getState().settings, locale: "pt-br" } });
  await show([
    entry({ id: "1", name: "a.pgn", state: "done", imported: 5000, overLimit: 1240 }),
    entry({ id: "2", name: "b.pgn", state: "failed", error: "database-limit" }),
  ]);
  const text = screen.getByTestId("library-import-widget").textContent ?? "";
  assert.match(text, /5\.000 importadas, 1\.240 acima do limite de 5\.000 por base/);
  assert.match(text, /Limite de 50 bases atingido\. Exclua uma base para importar outra\./);
});

test("isCleanlyFinished: only when every file finished with nothing to report", () => {
  assert.equal(isCleanlyFinished([]), false);
  assert.equal(isCleanlyFinished([entry({ name: "a", state: "done", imported: 3 })]), true);
  assert.equal(isCleanlyFinished([entry({ name: "a", state: "done" }), entry({ name: "b", state: "cancelled" })]), true);
  assert.equal(isCleanlyFinished([entry({ name: "a", state: "importing" })]), false);
  assert.equal(isCleanlyFinished([entry({ name: "a", state: "failed", error: "read" })]), false);
  assert.equal(isCleanlyFinished([entry({ name: "a", state: "done", overLimit: 10 })]), false);
  assert.equal(isCleanlyFinished([entry({ name: "a", state: "done", unreadable: 2 })]), false);
});

test("a cleanly finished import closes itself; one with something to report stays", async () => {
  const realSet = window.setTimeout;
  const timers: { fn: () => void; ms: number }[] = [];
  window.setTimeout = ((fn: () => void, ms: number) => {
    timers.push({ fn, ms });
    return timers.length;
  }) as typeof window.setTimeout;
  try {
    await show([entry({ name: "ok", state: "done", imported: 1 })]);
    const auto = timers.find((t) => t.ms === AUTO_DISMISS_MS);
    assert.ok(auto, "auto-dismiss scheduled");
    act(() => auto!.fn());
    assert.equal(screen.queryByTestId("library-import-widget"), null);
    cleanup();
    timers.length = 0;
    await show([entry({ name: "big", state: "done", imported: 5000, overLimit: 12 })]);
    assert.equal(timers.some((t) => t.ms === AUTO_DISMISS_MS), false);
    assert.ok(screen.getByTestId("library-import-widget"));
  } finally {
    window.setTimeout = realSet;
  }
});
