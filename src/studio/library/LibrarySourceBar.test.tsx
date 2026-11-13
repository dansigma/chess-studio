import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LibrarySourceBar } from "./LibrarySourceBar";
import { useLibraryStore } from "./library-store";
import { useStudioStore } from "@/src/store/studio-store";
import {
  DEFAULT_LIBRARY_FILTERS,
  type LibrarySourceAdapter,
  type LibrarySourceCapabilities,
} from "@/src/lib/library/types";
import { clearLibrarySources, registerLibrarySource } from "@/src/lib/library/sources";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const CAPS = {
  textSearch: "full", color: "full", result: "full", annotations: "full", position: "full", player: "full", eloRange: "full", eco: "full", date: "full", sort: "full", maxResults: null,
} satisfies LibrarySourceCapabilities;

function fake(id: LibrarySourceAdapter["id"], label: string, total: number | null = 0, fail = false): LibrarySourceAdapter {
  return {
    id,
    label: () => label,
    capabilities: () => CAPS,
    list: async () => {
      if (fail) {
        throw new Error("signed out");
      }
      return { items: [], nextCursor: null, total };
    },
    loadPgn: async () => "",
  };
}

beforeEach(() => {
  clearLibrarySources();
  registerLibrarySource(fake("my-games", "My Games", 1234));
  registerLibrarySource(fake("masters", "Masters (Lichess)", null));
  registerLibrarySource(fake("file:db1", "Tactics"));
  useStudioStore.setState((s) => ({
    settings: { ...s.settings, locale: "en" },
    files: { ...s.files, databases: [{ id: "db1", name: "Tactics", folderId: null, games: [{}, {}, {}] } as never] },
  }));
  useLibraryStore.setState({
    filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["my-games", "masters", "file:db1"] },
  });
});

const renderBar = async (errors = {}) => {
  render(<LibrarySourceBar sourceErrors={errors} />);
  await act(async () => { await Promise.resolve(); });
};
const sources = () => useLibraryStore.getState().filters.sources;
const card = (name: RegExp) => screen.getByRole("button", { name });

test("renders both groups with counts and the Masters limit label", async () => {
  await renderBar();
  const pub = screen.getByRole("group", { name: "Public databases" });
  const mine = screen.getByRole("group", { name: "My data" });
  assert.ok(within(pub).getByText("Top 15 per position"));
  assert.ok(within(mine).getByText("1,234 games"));
  assert.ok(within(mine).getByText("3 games"));
  assert.equal(within(pub).queryByText(/My Games/), null);
});

test("click selects only that source; aria-pressed marks selection", async () => {
  await renderBar();
  fireEvent.click(card(/Tactics/));
  assert.deepEqual(sources(), ["file:db1"]);
  assert.equal(card(/Tactics/).getAttribute("aria-pressed"), "true");
  assert.equal(card(/Masters/).getAttribute("aria-pressed"), "false");
});

test("modifier-click toggles and keeps at least one; All restores", async () => {
  await renderBar();
  fireEvent.click(card(/Masters/), { ctrlKey: true });
  assert.deepEqual(sources(), ["my-games", "file:db1"]);
  fireEvent.click(card(/Tactics/), { metaKey: true });
  assert.deepEqual(sources(), ["my-games"]);
  fireEvent.click(card(/My Games/), { ctrlKey: true });
  assert.deepEqual(sources(), ["my-games"]);
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  assert.equal(sources().length, 3);
});

test("shows a failure marker on the card and no count when My Games fails", async () => {
  clearLibrarySources();
  registerLibrarySource(fake("my-games", "My Games", 5, true));
  registerLibrarySource(fake("masters", "Masters (Lichess)", null));
  await renderBar({ masters: "boom" });
  assert.ok(screen.getByRole("img", { name: /Failed to load: boom/ }));
  assert.equal(screen.queryByText(/games$/), null);
});
