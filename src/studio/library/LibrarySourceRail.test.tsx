// SIG-1337: the Library sources rail — selection, PGN file actions, folders and
// the collapsible strip. Ports the old LibrarySourceBar and LibraryFolders cases.
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LibrarySourceAdapter, LibrarySourceCapabilities } from "@/src/lib/library/types";

let supabaseCalls = 0;
mock.module("@/src/lib/supabase/client", {
  namedExports: {
    createBrowserSupabase: () => {
      supabaseCalls += 1;
      return null;
    },
  },
});

const { LibrarySourceRail } = await import("./LibrarySourceRail");
const { LibraryView } = await import("./LibraryView");
const { useLibraryStore } = await import("./library-store");
const { resetImportQueue } = await import("./import-queue-store");
const { useStudioStore } = await import("@/src/store/studio-store");
const {
  DEFAULT_LIBRARY_FILTERS,
} = await import("@/src/lib/library/types");
const { clearLibrarySources, registerLibrarySource } = await import("@/src/lib/library/sources");
const { FOLDER_CYCLE_MESSAGE } = await import("@/src/lib/user-files");
const { LIBRARY_RAIL_KEY, readLibraryRailCollapsed, writeLibraryRailCollapsed } = await import(
  "./library-layout"
);

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  resetImportQueue();
});

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

type Row = { id: string; name: string; folderId: string | null; games: unknown[] };
const db = (id: string, name: string, folderId: string | null, gameCount = 0): Row => ({
  id,
  name,
  folderId,
  games: Array.from({ length: gameCount }, () => ({})),
});
const TACTICS = [db("db1", "Tactics", null, 3)];
const FILES = [
  db("d1", "Root file", null),
  db("d2", "Open file", "f1"),
  db("d3", "Sicilian file", "f2"),
  db("d4", "End file", "f3"),
];

/** Store, adapters and selection seeded like the old source bar / folders tests. */
function seed(rows: Row[], user: { id: string; email: string | null } | null = null) {
  useStudioStore.setState((s) => ({
    user,
    activity: "boards",
    settings: { ...s.settings, locale: "en" },
    databaseSource: "masters",
    files: {
      ...s.files,
      folders: [
        { id: "f1", name: "Openings", parentId: null },
        { id: "f2", name: "Sicilian", parentId: "f1" },
        { id: "f3", name: "Endings", parentId: null },
      ],
      databases: rows as never,
    },
  }));
  clearLibrarySources();
  registerLibrarySource(fake("my-games", "My Games", 1234));
  registerLibrarySource(fake("masters", "Masters (Lichess)", null));
  for (const row of rows) {
    registerLibrarySource(fake(`file:${row.id}`, row.name, row.games.length));
  }
  useLibraryStore.setState({
    folderId: null,
    filters: {
      ...DEFAULT_LIBRARY_FILTERS,
      sources: ["my-games", "masters", ...rows.map((row) => `file:${row.id}` as const)],
    },
  });
}

beforeEach(() => {
  supabaseCalls = 0;
  window.localStorage.clear();
});

const renderRail = async (errors: { [key: string]: string } = {}) => {
  render(<LibrarySourceRail sourceErrors={errors} />);
  await act(async () => { await Promise.resolve(); });
};
const sources = () => useLibraryStore.getState().filters.sources;
const card = (name: RegExp) => screen.getByRole("button", { name });
const cardNames = () => screen.queryAllByTestId("library-source-card").map((el) => el.textContent ?? "");
const folders = () => useStudioStore.getState().files.folders;
const openFolders = () => fireEvent.click(screen.getByRole("button", { name: "Folders" }));
/** The row that holds a source's selecting button and its hover actions. */
const rowOf = (name: RegExp) => card(name).parentElement as HTMLElement;
const folderRowOf = (name: string) => screen.getByRole("button", { name }).parentElement as HTMLElement;
const openMenu = () => fireEvent.click(screen.getByTestId("library-source-menu"));
const openRowMenu = (name: RegExp) => fireEvent.click(within(rowOf(name)).getByTestId("library-source-menu"));

test("renders the three sections with counts and the Masters limit label", async () => {
  seed(TACTICS);
  await renderRail();
  const pub = screen.getByRole("group", { name: "Public databases" });
  const mine = screen.getByRole("group", { name: "My games" });
  const files = screen.getByRole("group", { name: "My files" });
  assert.ok(within(pub).getByText("Top 15 per position"));
  assert.ok(within(mine).getByText("1,234 games"));
  assert.ok(within(files).getByText("3 games"));
  assert.equal(within(pub).queryByText(/My Games/), null);
});

test("click selects only that source; aria-pressed marks selection", async () => {
  seed(TACTICS);
  await renderRail();
  fireEvent.click(card(/^Tactics/));
  assert.deepEqual(sources(), ["file:db1"]);
  assert.equal(card(/^Tactics/).getAttribute("aria-pressed"), "true");
  assert.equal(card(/^Masters/).getAttribute("aria-pressed"), "false");
});

test("modifier-click toggles and keeps at least one; All restores", async () => {
  seed(TACTICS);
  await renderRail();
  fireEvent.click(card(/^Masters/), { ctrlKey: true });
  assert.deepEqual(sources(), ["my-games", "file:db1"]);
  fireEvent.click(card(/^Tactics/), { metaKey: true });
  assert.deepEqual(sources(), ["my-games"]);
  fireEvent.click(card(/^My Games/), { ctrlKey: true });
  assert.deepEqual(sources(), ["my-games"]);
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  assert.equal(sources().length, 3);
});

test("the game count sits on a subline under the name", async () => {
  seed(TACTICS);
  await renderRail();
  const count = within(rowOf(/^Tactics/)).getByTestId("library-source-count");
  assert.equal(count.textContent, "3 games");
  // Name and count are separate lines, so a long name never truncates against the count.
  assert.equal(count.previousElementSibling?.textContent, "Tactics");
});

test("the hover checkbox adds or removes a source and keeps the last one", async () => {
  seed(TACTICS);
  await renderRail();
  fireEvent.click(card(/^Tactics/));
  const box = (name: RegExp) => within(rowOf(name)).getByTestId("library-source-checkbox") as HTMLInputElement;
  assert.equal(box(/^Tactics/).checked, true);
  assert.equal(box(/^Tactics/).disabled, true); // the last selected source stays
  fireEvent.click(box(/^Masters/));
  assert.deepEqual(sources(), ["file:db1", "masters"]);
  assert.equal(box(/^Masters/).checked, true);
  assert.equal(box(/^Tactics/).disabled, false);
  assert.ok(box(/^Masters/).getAttribute("aria-label")?.includes("Masters"));
  fireEvent.click(box(/^Tactics/));
  assert.deepEqual(sources(), ["masters"]);
});

test("shows a failure marker on the row and no count when My Games fails", async () => {
  seed(TACTICS);
  clearLibrarySources();
  registerLibrarySource(fake("my-games", "My Games", 5, true));
  registerLibrarySource(fake("masters", "Masters (Lichess)", null));
  await renderRail({ masters: "boom" });
  assert.ok(screen.getByRole("img", { name: /Failed to load: boom/ }));
  assert.equal(within(screen.getByRole("group", { name: "My games" })).queryByText(/^\d[\d,]* games$/), null);
});

const downloads: { name: string; text: string }[] = [];
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

test("only PGN file rows have a “…” menu", async () => {
  seed(TACTICS);
  await renderRail();
  assert.equal(screen.getAllByTestId("library-source-menu").length, 1);
  openMenu();
  assert.deepEqual(
    screen.getAllByRole("menuitem").map((item) => item.textContent),
    ["Rename", "Move to folder…", "Export (.pgn)", "Delete"],
  );
});

test("opening the menu does not select the row", async () => {
  seed(TACTICS);
  useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["masters"] } });
  await renderRail();
  openMenu();
  assert.deepEqual(sources(), ["masters"]);
});

test("rename: Enter saves, empty is refused, Esc cancels", async () => {
  seed(TACTICS);
  await renderRail();
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
  seed([{ id: "db1", name: 'Tac/tics:"1"', folderId: null, games: [{ pgn: "1. e4 *\n" }, { pgn: "1. d4 *" }] }]);
  await renderRail();
  openMenu();
  await withDownloadSpy(() => fireEvent.click(screen.getByRole("menuitem", { name: "Export (.pgn)" })));
  assert.deepEqual(downloads.pop(), { name: "Tactics1.pgn", text: "1. e4 *\n\n1. d4 *\n" });
});

test("delete asks first, then removes the file", async () => {
  seed(TACTICS);
  await renderRail();
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

const refBadges = () => screen.queryAllByTestId("library-source-ref-badge");
const referenceActions = () => screen.queryAllByTestId("library-source-reference");

test("REF badge: only the reference row shows it, and it follows databaseSource", async () => {
  seed(TACTICS);
  useStudioStore.setState({ databaseSource: "masters" });
  await renderRail();
  assert.equal(refBadges().length, 1);
  assert.equal(refBadges()[0]!.textContent, "REF");
  assert.equal(refBadges()[0]!.getAttribute("title"), "Studio reference database");
  assert.equal(
    within(screen.getByRole("group", { name: "Public databases" })).getAllByTestId("library-source-ref-badge").length,
    1,
  );

  useStudioStore.setState({ databaseSource: "file:db1" });
  await act(async () => { await Promise.resolve(); });
  assert.equal(refBadges().length, 1);
  assert.equal(
    within(screen.getByRole("group", { name: "My files" })).getAllByTestId("library-source-ref-badge").length,
    1,
  );
  assert.equal(
    within(screen.getByRole("group", { name: "Public databases" })).queryAllByTestId("library-source-ref-badge").length,
    0,
  );
});

test("reference action: on Masters and files, never on the current reference or My Games", async () => {
  seed(TACTICS);
  useStudioStore.setState({ databaseSource: "masters" });
  await renderRail();
  // Masters already is the reference; only the file row offers the action.
  assert.equal(referenceActions().length, 1);
  assert.equal(referenceActions()[0]!.getAttribute("aria-label"), "Use as Explorer reference database");
  assert.equal(
    within(screen.getByRole("group", { name: "My games" })).queryAllByTestId("library-source-reference").length,
    0,
  );
  assert.equal(
    within(screen.getByRole("group", { name: "My files" })).queryAllByTestId("library-source-reference").length,
    1,
  );
});

test("reference action: sets the reference without selecting the row", async () => {
  seed(TACTICS);
  useStudioStore.setState({ databaseSource: "masters" });
  await renderRail();
  const before = sources();
  fireEvent.click(referenceActions()[0]!);
  assert.equal(useStudioStore.getState().databaseSource, "file:db1");
  assert.deepEqual(sources(), before);
  // The chosen file no longer offers the action; Masters does.
  assert.equal(refBadges().length, 1);
  assert.equal(refBadges()[0]!.closest('[data-testid="library-source-card"]')?.textContent?.includes("Tactics"), true);
  assert.equal(referenceActions().length, 1);
  assert.equal(referenceActions()[0]!.getAttribute("aria-label"), "Use as Explorer reference database");
});

test("reference action: an outside reference shows no badge and Masters' tooltip names it", async () => {
  seed(TACTICS);
  useStudioStore.setState({ databaseSource: "lichess" });
  await renderRail();
  assert.equal(refBadges().length, 0);
  const masters = within(screen.getByRole("group", { name: "Public databases" })).getByTestId(
    "library-source-reference",
  );
  assert.match(masters.getAttribute("aria-label") ?? "", /Explorer reference: Online Database/);
  assert.match(masters.getAttribute("aria-label") ?? "", /Use as Explorer reference database/);
});

test("each row shows an icon for its kind; the selected row's icon takes the accent", async () => {
  seed(FILES);
  await renderRail();
  const icon = (name: RegExp) => within(rowOf(name)).getByTestId("library-source-icon");
  assert.equal(within(screen.getByRole("group", { name: "Public databases" })).getByTestId("library-source-icon").getAttribute("data-kind"), "public");
  assert.equal(within(screen.getByRole("group", { name: "My games" })).getByTestId("library-source-icon").getAttribute("data-kind"), "mine");
  assert.equal(icon(/^Root file/).getAttribute("data-kind"), "file");

  const folderIcon = () =>
    within(screen.getByRole("button", { name: "Openings" })).getByTestId("library-source-icon");
  assert.equal(folderIcon().getAttribute("data-kind"), "folder");
  assert.match(folderIcon().getAttribute("class") ?? "", /lucide-folder-open/);
  fireEvent.click(screen.getByRole("button", { name: "Collapse Openings" }));
  assert.match(folderIcon().getAttribute("class") ?? "", /lucide-folder(?!-open)/);

  fireEvent.click(card(/^Root file/));
  assert.match(icon(/^Root file/).getAttribute("class") ?? "", /text-studio-accent-text/);
  assert.doesNotMatch(icon(/^End file/).getAttribute("class") ?? "", /text-studio-accent-text/);
});

test("quick actions: reference, rename and “…” for files; rename for folders; none for My Games", async () => {
  seed(FILES);
  useStudioStore.setState({ databaseSource: "masters" });
  await renderRail();
  const fileRow = rowOf(/^Root file/);
  assert.ok(within(fileRow).getByTestId("library-source-reference"));
  assert.ok(within(fileRow).getByTestId("library-source-rename"));
  assert.ok(within(fileRow).getByTestId("library-source-menu"));
  // The actions join the row on hover or keyboard focus; the count keeps its
  // place instead of fading out under them.
  const actions = within(fileRow).getByTestId("library-source-reference").parentElement!;
  assert.match(actions.className, /hidden/);
  assert.match(actions.className, /group-hover:flex/);
  assert.match(actions.className, /group-focus-within:flex/);
  assert.doesNotMatch(actions.className, /pointer-events-none/);
  assert.doesNotMatch(within(fileRow).getByText("0 games").className, /group-hover:opacity-0/);

  const folderRow = folderRowOf("Openings");
  assert.ok(within(folderRow).getByTestId("library-folder-rename"));
  assert.equal(within(folderRow).queryByTestId("library-source-reference"), null);
  assert.equal(within(folderRow).queryByTestId("library-source-menu"), null);

  assert.equal(
    within(screen.getByRole("group", { name: "My games" })).queryAllByTestId("library-source-reference").length,
    0,
  );

  // Rename from the row starts the inline editor without selecting the row.
  const before = sources();
  fireEvent.click(within(fileRow).getByTestId("library-source-rename"));
  assert.ok(screen.getByRole("textbox", { name: "File name" }));
  assert.deepEqual(sources(), before);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "File name" }), { key: "Escape" });
  assert.equal(screen.queryByRole("textbox"), null);
});

test("right-clicking a file opens its “…” menu at the pointer", async () => {
  seed(TACTICS);
  await renderRail();
  fireEvent.contextMenu(card(/^Tactics/), { clientX: 40, clientY: 60 });
  assert.deepEqual(
    screen.getAllByRole("menuitem").map((item) => item.textContent),
    ["Rename", "Move to folder…", "Export (.pgn)", "Delete"],
  );
});

test("right-clicking a folder opens that folder's actions", async () => {
  seed(FILES);
  await renderRail();
  const before = sources();
  fireEvent.contextMenu(screen.getByRole("button", { name: "Endings" }), { clientX: 30, clientY: 40 });
  assert.deepEqual(
    screen.getAllByRole("menuitem").map((item) => item.textContent),
    ["New subfolder…", "Rename folder…", "Move folder…", "Delete folder…"],
  );
  assert.equal(useLibraryStore.getState().folderId, null, "right-click does not select the folder");
  assert.deepEqual(sources(), before);

  fireEvent.click(screen.getByRole("menuitem", { name: "Rename folder…" }));
  const input = screen.getByRole("textbox", { name: "Folder name" }) as HTMLInputElement;
  assert.equal(input.value, "Endings");
  fireEvent.change(input, { target: { value: "Finales" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  assert.equal(folders().find((folder) => folder.id === "f3")?.name, "Finales");
  assert.equal(screen.queryByRole("dialog"), null);

  // A new subfolder lands in the right-clicked folder, not the selected one.
  fireEvent.contextMenu(screen.getByRole("button", { name: "Openings" }), { clientX: 30, clientY: 40 });
  fireEvent.click(screen.getByRole("menuitem", { name: "New subfolder…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), { target: { value: "Rooks" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  assert.equal(folders().find((folder) => folder.name === "Rooks")?.parentId, "f1");
});

test("the folder tree nests each file under its folder and folders collapse", async () => {
  seed(FILES);
  await renderRail();
  assert.equal(cardNames().filter((name) => name.includes("file")).length, 4);
  assert.ok(screen.getByRole("button", { name: "Openings" }));
  assert.ok(card(/^Open file/));
  assert.ok(card(/^Sicilian file/));

  fireEvent.click(screen.getByRole("button", { name: "Collapse Openings" }));
  assert.equal(screen.queryByRole("button", { name: "Sicilian" }), null);
  assert.equal(screen.queryByRole("button", { name: /^Open file/ }), null);
  assert.equal(screen.queryByRole("button", { name: /^Sicilian file/ }), null);
  assert.ok(card(/^Root file/));
  assert.ok(card(/^End file/));

  fireEvent.click(screen.getByRole("button", { name: "Expand Openings" }));
  assert.ok(card(/^Open file/));
  assert.ok(card(/^Sicilian file/));
});

test("clicking a folder selects its files and sets the folder", async () => {
  seed(FILES);
  useLibraryStore.setState({ filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["my-games"] } });
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "Openings" }));
  assert.equal(useLibraryStore.getState().folderId, "f1");
  assert.deepEqual(sources(), ["file:d2", "file:d3"]);

  fireEvent.click(screen.getByRole("button", { name: "Sicilian" }));
  assert.equal(useLibraryStore.getState().folderId, "f2");
  assert.deepEqual(sources(), ["file:d3"]);

  fireEvent.click(screen.getByRole("button", { name: "Endings" }));
  assert.equal(useLibraryStore.getState().folderId, "f3");
  assert.deepEqual(sources(), ["file:d4"]);
});

test("Folders menu creates a folder and a subfolder", async () => {
  seed(FILES);
  await renderRail();
  openFolders();
  assert.equal(screen.getByRole("menuitem", { name: "New subfolder…" }).hasAttribute("disabled"), true);
  fireEvent.click(screen.getByRole("menuitem", { name: "New folder…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), { target: { value: "Tactics" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  const created = folders().find((folder) => folder.name === "Tactics");
  assert.ok(created);
  assert.equal(created.parentId, null);
  assert.equal(useStudioStore.getState().activity, "boards", "no side panel opens");

  fireEvent.click(screen.getByRole("button", { name: "Endings" }));
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "New subfolder…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), { target: { value: "Rooks" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  assert.equal(folders().find((folder) => folder.name === "Rooks")?.parentId, "f3");
});

test("renaming the selected folder", async () => {
  seed(FILES);
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "Endings" }));
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename folder…" }));
  const input = screen.getByRole("textbox", { name: "Folder name" }) as HTMLInputElement;
  assert.equal(input.value, "Endings");
  fireEvent.change(input, { target: { value: "Endgames" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  assert.equal(folders().find((folder) => folder.id === "f3")?.name, "Endgames");
});

test("deleting a folder asks first, removes subfolders and keeps the files", async () => {
  seed(FILES);
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "Openings" }));
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete folder…" }));
  assert.equal(folders().length, 3, "nothing is deleted before confirming");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  assert.equal(folders().length, 3);
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete folder…" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
  assert.deepEqual(folders().map((folder) => folder.id), ["f3"]);
  const files = useStudioStore.getState().files.databases;
  assert.equal(files.length, 4);
  assert.equal(files.find((database) => database.id === "d3")?.folderId, null);
  assert.equal(useLibraryStore.getState().folderId, null);
});

test("moving a folder: cycle targets are disabled and the store refuses them", async () => {
  seed(FILES);
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "Openings" }));
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Move folder…" }));
  const dialog = within(screen.getByRole("dialog"));
  assert.equal(dialog.getByRole("button", { name: "Openings" }).hasAttribute("disabled"), true);
  assert.equal(dialog.getByRole("button", { name: "Sicilian" }).hasAttribute("disabled"), true);
  assert.equal(dialog.getByRole("button", { name: "Top level (no folder)" }).hasAttribute("disabled"), true);
  assert.equal(useStudioStore.getState().moveFileFolder("f1", "f2"), false);
  assert.equal(FOLDER_CYCLE_MESSAGE.length > 0, true);
  fireEvent.click(dialog.getByRole("button", { name: "Endings" }));
  assert.equal(folders().find((folder) => folder.id === "f1")?.parentId, "f3");

  fireEvent.click(screen.getByRole("button", { name: "Sicilian" }));
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Move folder…" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Top level (no folder)" }));
  assert.equal(folders().find((folder) => folder.id === "f2")?.parentId, null);
});

test("Move to folder… on a file row moves it, and No folder takes it out", async () => {
  seed(FILES);
  await renderRail();
  openRowMenu(/^Root file/);
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to folder…" }));
  const dialog = within(screen.getByRole("dialog"));
  assert.equal(dialog.getByRole("button", { name: "No folder" }).hasAttribute("disabled"), true);
  fireEvent.click(dialog.getByRole("button", { name: "Endings" }));
  assert.equal(useStudioStore.getState().files.databases.find((database) => database.id === "d1")?.folderId, "f3");
  assert.equal(screen.queryByRole("dialog"), null);
  openRowMenu(/^Root file/);
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to folder…" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "No folder" }));
  assert.equal(useStudioStore.getState().files.databases.find((database) => database.id === "d1")?.folderId, null);
});

test("Refresh from account shows only when signed in and fetches then", async () => {
  seed(FILES);
  await renderRail();
  openFolders();
  assert.equal(screen.queryByRole("menuitem", { name: "Refresh from account" }), null);
  cleanup();
  seed(FILES, { id: "u1", email: null });
  await renderRail();
  openFolders();
  const before = supabaseCalls;
  await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Refresh from account" })); });
  await act(async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.ok(supabaseCalls > before, "loadRemoteFiles ran");
  assert.equal(useStudioStore.getState().statusMessage, "Files refreshed");
});

test("the import button offers From file… and Paste PGN", async () => {
  seed(FILES);
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "+ Import PGN" }));
  assert.deepEqual(screen.getAllByRole("menuitem").map((item) => item.textContent), ["From file…", "Paste PGN"]);
});

const PGN = '[Event "t"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n';
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0)); });

test("Paste PGN imports through the queue into the viewed folder", async () => {
  seed([]);
  useLibraryStore.setState({ folderId: "f3" });
  await act(async () => { render(<LibraryView />); });
  fireEvent.click(screen.getByRole("button", { name: "+ Import PGN" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Paste PGN" }));
  const dialog = within(screen.getByRole("dialog"));
  assert.equal(dialog.getByRole("button", { name: "Import" }).hasAttribute("disabled"), true);
  fireEvent.change(dialog.getByRole("textbox", { name: "Database name" }), { target: { value: "My paste" } });
  fireEvent.change(dialog.getByRole("textbox", { name: "PGN text" }), { target: { value: PGN } });
  await act(async () => { fireEvent.click(dialog.getByRole("button", { name: "Import" })); });
  await settle();
  const dbs = useStudioStore.getState().files.databases;
  assert.equal(dbs.length, 1);
  assert.equal(dbs[0].name, "My paste");
  assert.equal(dbs[0].games.length, 1);
  assert.equal(dbs[0].folderId, "f3");
  assert.equal(screen.getAllByTestId("library-import-entry")[0].getAttribute("data-state"), "done");
});

test("Paste PGN with an existing name opens the name-conflict dialog", async () => {
  seed([db("x", "Dup", null)]);
  await act(async () => { render(<LibraryView />); });
  fireEvent.click(screen.getByRole("button", { name: "+ Import PGN" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Paste PGN" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByRole("textbox", { name: "Database name" }), { target: { value: "Dup" } });
  fireEvent.change(dialog.getByRole("textbox", { name: "PGN text" }), { target: { value: PGN } });
  await act(async () => { fireEvent.click(dialog.getByRole("button", { name: "Import" })); });
  await settle();
  assert.ok(screen.getByTestId("library-import-conflict").textContent?.includes("Dup"));
  assert.equal(screen.getAllByTestId("library-import-entry")[0].getAttribute("data-state"), "awaiting");
});

test("rail collapse state round-trips through library-layout.ts", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
  assert.equal(readLibraryRailCollapsed(storage), false);
  writeLibraryRailCollapsed(true, storage);
  assert.equal(values.get(LIBRARY_RAIL_KEY), "collapsed");
  assert.equal(readLibraryRailCollapsed(storage), true);
  writeLibraryRailCollapsed(false, storage);
  assert.equal(readLibraryRailCollapsed(storage), false);
});

test("collapsing and expanding the rail persists in localStorage", async () => {
  seed(TACTICS);
  await renderRail();
  assert.equal(readLibraryRailCollapsed(), false);
  assert.ok(screen.getByText("Sources"));

  fireEvent.click(screen.getByRole("button", { name: "Collapse sources" }));
  assert.equal(readLibraryRailCollapsed(), true);
  assert.equal(screen.queryByText("Sources"), null);
  const markers = screen.getAllByTestId("library-source-marker");
  assert.equal(markers.length, 3);
  assert.ok(markers.some((marker) => marker.getAttribute("title") === "Tactics · 3 games"));

  cleanup();
  await renderRail();
  // Mounted again after the effect reads the stored choice.
  assert.equal(screen.queryByText("Sources"), null);
  assert.equal(screen.getAllByTestId("library-source-marker").length, 3);
  fireEvent.click(screen.getByRole("button", { name: "Tactics · 3 games" }));
  assert.deepEqual(sources(), ["file:db1"]);

  fireEvent.click(screen.getByRole("button", { name: "Expand sources" }));
  assert.equal(readLibraryRailCollapsed(), false);
  assert.ok(screen.getByText("Sources"));

  cleanup();
  await renderRail();
  assert.ok(screen.getByText("Sources"));
});

test("collapsed rail markers show the kind icon; the selected one takes the accent", async () => {
  seed(TACTICS);
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "Collapse sources" }));
  const marker = (title: string) =>
    screen.getAllByTestId("library-source-marker").find((el) => el.getAttribute("title") === title)!;
  const masters = marker("Masters (Lichess) · Top 15 per position");
  const games = marker("My Games · 1,234 games");
  const file = marker("Tactics · 3 games");
  assert.equal(within(masters).getByTestId("library-source-icon").getAttribute("data-kind"), "public");
  assert.equal(within(games).getByTestId("library-source-icon").getAttribute("data-kind"), "mine");
  assert.equal(within(file).getByTestId("library-source-icon").getAttribute("data-kind"), "file");
  assert.equal(file.textContent?.trim(), "", "no first letter any more");

  fireEvent.click(file);
  assert.match(
    within(marker("Tactics · 3 games")).getByTestId("library-source-icon").getAttribute("class") ?? "",
    /text-studio-accent-text/,
  );
  assert.doesNotMatch(
    within(marker("My Games · 1,234 games")).getByTestId("library-source-icon").getAttribute("class") ?? "",
    /text-studio-accent-text/,
  );
});

test("pt-BR strings", async () => {
  seed(FILES);
  useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "pt-br" } }));
  await renderRail();
  assert.ok(screen.getByText("Bases", { exact: true }));
  assert.ok(screen.getByRole("group", { name: "Bases públicas" }));
  assert.ok(screen.getByRole("group", { name: "Minhas partidas" }));
  assert.ok(screen.getByRole("group", { name: "Meus arquivos" }));
  assert.ok(screen.getByRole("button", { name: "Pastas" }));
  assert.ok(screen.getByRole("button", { name: "+ Importar PGN" }));
  assert.ok(screen.getByRole("button", { name: "Recolher bases" }));
});

test("leaving a folder: clicking it again or All clears the current folder", async () => {
  seed(FILES);
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "Openings" }));
  assert.equal(useLibraryStore.getState().folderId, "f1");
  fireEvent.click(screen.getByRole("button", { name: "Openings" }));
  assert.equal(useLibraryStore.getState().folderId, null);

  fireEvent.click(screen.getByRole("button", { name: "Endings" }));
  assert.equal(useLibraryStore.getState().folderId, "f3");
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  assert.equal(useLibraryStore.getState().folderId, null);
});

test("an empty folder selects no source, stays the import target and is highlighted", async () => {
  seed([db("d1", "Root file", null), db("d2", "Open file", "f1")]);
  await renderRail();
  fireEvent.click(screen.getByRole("button", { name: "Openings" }));
  assert.deepEqual(sources(), ["file:d2"]);

  // Endings (f3) holds no PGN file: the table must not keep showing Openings.
  fireEvent.click(screen.getByRole("button", { name: "Endings" }));
  assert.equal(useLibraryStore.getState().folderId, "f3", "imports land in the folder being viewed");
  assert.deepEqual(sources(), [], "the table queries the empty folder, not the previous selection");
});

test("the empty folder survives a database change (rename, import elsewhere, refresh)", async () => {
  const { useLibrarySources } = await import("./library-sources");
  function WithSources() {
    useLibrarySources();
    return <LibrarySourceRail sourceErrors={{}} />;
  }
  seed([db("d1", "Root file", null), db("d2", "Open file", "f1")]);
  render(<WithSources />);
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByRole("button", { name: "Endings" }));
  assert.deepEqual(sources(), []);

  await act(async () => {
    useStudioStore.getState().renameFileDatabase("d1", "Renamed file");
  });
  assert.equal(useStudioStore.getState().files.databases.find((item) => item.id === "d1")?.name, "Renamed file");
  assert.deepEqual(sources(), [], "the reconcile effect keeps the empty folder's selection");
  assert.equal(useLibraryStore.getState().folderId, "f3");

  // Leaving the folder restores the normal fallback.
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  assert.equal(useLibraryStore.getState().folderId, null);
  assert.ok(sources().length > 0);
});

test("collapsed rail: failed sources keep their mark and import stays available", async () => {
  seed(TACTICS);
  await renderRail({ masters: "boom" });
  fireEvent.click(screen.getByRole("button", { name: "Collapse sources" }));
  const failed = screen.getAllByTestId("library-source-marker").filter((marker) => marker.hasAttribute("data-failed"));
  assert.equal(failed.length, 1);
  assert.match(failed[0]!.getAttribute("title") ?? "", /Failed to load: boom/);
  assert.equal(screen.getAllByTestId("library-source-marker-failed").length, 1);

  fireEvent.click(screen.getByRole("button", { name: "+ Import PGN" }));
  assert.ok(screen.getByRole("menuitem", { name: "From file…" }));
  assert.ok(screen.getByRole("menuitem", { name: "Paste PGN" }));
  fireEvent.click(screen.getByRole("button", { name: "Expand sources" }));
});
