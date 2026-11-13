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
  fireEvent.click(card(/^Tactics/));
  assert.deepEqual(sources(), ["file:db1"]);
  assert.equal(card(/^Tactics/).getAttribute("aria-pressed"), "true");
  assert.equal(card(/^Masters/).getAttribute("aria-pressed"), "false");
});

test("modifier-click toggles and keeps at least one; All restores", async () => {
  await renderBar();
  fireEvent.click(card(/^Masters/), { ctrlKey: true });
  assert.deepEqual(sources(), ["my-games", "file:db1"]);
  fireEvent.click(card(/^Tactics/), { metaKey: true });
  assert.deepEqual(sources(), ["my-games"]);
  fireEvent.click(card(/^My Games/), { ctrlKey: true });
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

const downloads: { name: string; text: string }[] = [];
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: /File actions: Tactics/ }));
const withDownloadSpy = async (run: () => void) => {
  const g = globalThis as unknown as { URL: typeof URL };
  const blobs = new Map<string, Blob>();
  const origCreate = g.URL.createObjectURL;
  const origRevoke = g.URL.revokeObjectURL;
  let n = 0;
  g.URL.createObjectURL = ((blob: Blob) => {
    const url = `blob:${n++}`;
    blobs.set(url, blob);
    return url;
  }) as never;
  g.URL.revokeObjectURL = (() => {}) as never;
  const origClick = window.HTMLAnchorElement.prototype.click;
  const pending: Promise<void>[] = [];
  window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    pending.push(blob!.text().then((text) => void downloads.push({ name: this.download, text })));
  };
  try {
    run();
    await Promise.all(pending);
  } finally {
    window.HTMLAnchorElement.prototype.click = origClick;
    g.URL.createObjectURL = origCreate;
    g.URL.revokeObjectURL = origRevoke;
  }
};

test("only PGN file cards have a menu", async () => {
  await renderBar();
  assert.equal(screen.getAllByTestId("library-source-menu").length, 1);
  openMenu();
  assert.deepEqual(
    screen.getAllByRole("menuitem").map((item) => item.textContent),
    ["Rename", "Export (.pgn)", "Delete"],
  );
});

test("opening the menu does not select the card", async () => {
  useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["masters"] } });
  await renderBar();
  openMenu();
  assert.deepEqual(sources(), ["masters"]);
});

test("rename: Enter saves, empty is refused, Esc cancels", async () => {
  await renderBar();
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
  let input = screen.getByRole("textbox", { name: "File name" });
  fireEvent.change(input, { target: { value: "  " } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(useStudioStore.getState().files.databases[0].name, "Tactics");
  assert.ok(screen.getByRole("textbox", { name: "File name" }));
  fireEvent.change(input, { target: { value: "Endgames" } });
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(screen.queryByRole("textbox"), null);
  assert.equal(useStudioStore.getState().files.databases[0].name, "Tactics");

  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
  input = screen.getByRole("textbox", { name: "File name" });
  fireEvent.change(input, { target: { value: " Endgames " } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(screen.queryByRole("textbox"), null);
  assert.equal(useStudioStore.getState().files.databases[0].name, "Endgames");
});

test("export downloads every game joined by a blank line", async () => {
  useStudioStore.setState((s) => ({
    files: {
      ...s.files,
      databases: [{ id: "db1", name: 'Tac/tics:"1"', folderId: null, games: [{ pgn: "1. e4 *\n" }, { pgn: "1. d4 *" }] } as never],
    },
  }));
  await renderBar();
  fireEvent.click(screen.getByRole("button", { name: /File actions/ }));
  await withDownloadSpy(() => fireEvent.click(screen.getByRole("menuitem", { name: "Export (.pgn)" })));
  assert.deepEqual(downloads.pop(), { name: "Tactics1.pgn", text: "1. e4 *\n\n1. d4 *\n" });
});

test("delete asks first, then removes the file", async () => {
  await renderBar();
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  assert.equal(useStudioStore.getState().files.databases.length, 1);
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
  assert.equal(useStudioStore.getState().files.databases.length, 0);
});

const stars = () => screen.queryAllByTestId("library-source-reference");

test("stars: Masters and file cards have one, My Games none; only the reference is filled", async () => {
  useStudioStore.setState({ databaseSource: "masters" });
  await renderBar();
  assert.equal(stars().length, 2);
  const pressed = stars().map((el) => el.getAttribute("aria-pressed"));
  assert.deepEqual(pressed, ["true", "false"]);
  assert.equal(stars()[0].getAttribute("aria-label"), "Explorer reference database");
  assert.equal(stars()[1].getAttribute("aria-label"), "Use as Explorer reference database");
});

test("stars: clicking an empty star sets the source without selecting the card; filled is a no-op", async () => {
  useStudioStore.setState({ databaseSource: "masters" });
  await renderBar();
  const before = sources();
  fireEvent.click(stars()[1]);
  assert.equal(useStudioStore.getState().databaseSource, "file:db1");
  assert.deepEqual(sources(), before);
  fireEvent.click(stars()[1]);
  assert.equal(useStudioStore.getState().databaseSource, "file:db1");
  assert.equal(stars()[1].getAttribute("aria-pressed"), "true");
  assert.equal(stars()[0].getAttribute("aria-pressed"), "false");
});

test("stars: a lichess reference fills none and Masters' tooltip names it", async () => {
  useStudioStore.setState({ databaseSource: "lichess" });
  await renderBar();
  assert.deepEqual(stars().map((el) => el.getAttribute("aria-pressed")), ["false", "false"]);
  assert.match(stars()[0].getAttribute("aria-label") ?? "", /Explorer reference: Online Database/);
});
