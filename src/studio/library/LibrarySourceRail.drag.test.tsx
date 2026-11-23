// SIG-1343: drag a PGN file row onto a folder in the rail, and drop .pgn files
// from the computer straight onto a folder. Separate from the shared
// LibrarySourceRail.test.tsx so the drag cases stay easy to read.
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { LibrarySourceAdapter, LibrarySourceCapabilities } from "@/src/lib/library/types";

mock.module("@/src/lib/supabase/client", {
  namedExports: {
    createBrowserSupabase: () => null,
  },
});

const { LibraryView } = await import("./LibraryView");
const { useLibraryStore } = await import("./library-store");
const { useStudioStore } = await import("@/src/store/studio-store");
const { resetImportQueue, useImportQueue } = await import("./import-queue-store");
const { clearLibrarySources, registerLibrarySource } = await import("@/src/lib/library/sources");
const { LIBRARY_DATABASE_MIME, FOLDER_EXPAND_DELAY_MS } = await import("./library-drag");
const { DEFAULT_LIBRARY_FILTERS } = await import("@/src/lib/library/types");

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  resetImportQueue();
});

const CAPS = {
  textSearch: "full", color: "full", result: "full", annotations: "full", position: "full", player: "full", eloRange: "full", eco: "full", date: "full", sort: "full", maxResults: null,
} satisfies LibrarySourceCapabilities;

function fake(id: LibrarySourceAdapter["id"], label: string): LibrarySourceAdapter {
  return {
    id,
    label: () => label,
    capabilities: () => CAPS,
    list: async () => ({ items: [], nextCursor: null, total: 0 }),
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
const ROOT_FILE = db("d1", "Root file", null);
const FOLDER_FILE = db("d2", "Open file", "f1");
const OTHER_FILE = db("d3", "Sicilian file", "f2");

const PGN = '[Event "t"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n';
const pgnFile = (name: string) => new File([PGN], name);
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });

function seed(rows: Row[], folderId: string | null = null) {
  useStudioStore.setState((s) => ({
    user: null,
    activity: "boards",
    statusMessage: null,
    settings: { ...s.settings, locale: "en" },
    databaseSource: "masters",
    filesHydrated: true,
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
  registerLibrarySource(fake("my-games", "My Games"));
  registerLibrarySource(fake("masters", "Masters (Lichess)"));
  for (const row of rows) {
    registerLibrarySource(fake(`file:${row.id}`, row.name));
  }
  useLibraryStore.setState({
    folderId,
    filters: {
      ...DEFAULT_LIBRARY_FILTERS,
      sources: ["masters", ...rows.map((row) => `file:${row.id}` as const)],
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

type FakeTransfer = {
  types: string[];
  files: File[];
  dropEffect: string;
  effectAllowed: string;
  setData: (type: string, value: string) => void;
  getData: (type: string) => string;
};

/** What a browser's DataTransfer looks like to the handlers, with the private type preloaded. */
function transfer(options: { files?: File[]; databaseId?: string } = {}): FakeTransfer {
  const data = new Map<string, string>();
  const files = options.files ?? [];
  const dt: FakeTransfer = {
    types: files.length > 0 ? ["Files"] : [],
    files,
    dropEffect: "none",
    effectAllowed: "none",
    setData: (type, value) => {
      data.set(type, value);
      if (!dt.types.includes(type)) {
        dt.types.push(type);
      }
    },
    getData: (type) => data.get(type) ?? "",
  };
  if (options.databaseId) {
    dt.setData(LIBRARY_DATABASE_MIME, options.databaseId);
  }
  return dt;
}

const renderView = async () => {
  await act(async () => {
    render(<LibraryView />);
    // Let the rail's adapter promises settle inside act, like a mounted page would.
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
};
const card = (name: RegExp) => screen.getByRole("button", { name });
/** The row that holds a source's selecting button: the element carrying the drag. */
const rowOf = (name: RegExp) => card(name).parentElement as HTMLElement;
const folderButton = (name: string) => screen.getByRole("button", { name });
const folderRow = (name: string) => folderButton(name).parentElement as HTMLElement;
const heading = () => screen.getByRole("heading", { name: "My files" });
const database = (id: string) => useStudioStore.getState().files.databases.find((item) => item.id === id);
const databases = () => useStudioStore.getState().files.databases;

/** Start a PGN row drag; the same transfer is then used for dragover and drop, as in a browser. */
function startDatabaseDrag(name: RegExp, databaseId: string): FakeTransfer {
  const dt = transfer();
  fireEvent.dragStart(rowOf(name), { dataTransfer: dt });
  assert.equal(dt.getData(LIBRARY_DATABASE_MIME), databaseId, "the row carries its database id");
  return dt;
}

test("a PGN row is draggable and can be dropped on a folder to move it", async () => {
  seed([ROOT_FILE, FOLDER_FILE, OTHER_FILE]);
  await renderView();
  assert.equal(rowOf(/^Open file/).getAttribute("draggable"), "true");
  assert.equal(rowOf(/^Masters/).getAttribute("draggable"), null, "only PGN file rows drag");

  const dt = startDatabaseDrag(/^Sicilian file/, "d3");
  fireEvent.dragOver(folderButton("Endings"), { dataTransfer: dt });
  assert.equal(folderRow("Endings").getAttribute("data-drop-target"), "", "the folder under the pointer is marked");
  assert.match(folderRow("Endings").className, /ring-studio-accent/);
  fireEvent.drop(folderButton("Endings"), { dataTransfer: dt });
  assert.equal(database("d3")?.folderId, "f3");
  assert.equal(folderRow("Endings").hasAttribute("data-drop-target") === false, true);
  // Moving a rail row must not trigger the Library import drop zone.
  assert.equal(screen.queryByTestId("library-drop-overlay"), null);
  assert.equal(useImportQueue.getState().entries.length, 0);
});

test("dropping a PGN row on the My files heading takes it out of its folder", async () => {
  seed([ROOT_FILE, FOLDER_FILE]);
  await renderView();

  let moves = 0;
  const original = useStudioStore.getState().moveFileDatabase;
  await act(async () => {
    useStudioStore.setState({
      moveFileDatabase: (id, folderId) => {
        moves += 1;
        original(id, folderId);
      },
    });
  });
  try {
    const dt = startDatabaseDrag(/^Root file/, "d1");
    fireEvent.dragOver(heading(), { dataTransfer: dt });
    assert.equal(heading().getAttribute("data-drop-target"), "");
    fireEvent.drop(heading(), { dataTransfer: dt });
    assert.equal(moves, 0, "a root file is already at the top level");

    const dt2 = startDatabaseDrag(/^Open file/, "d2");
    fireEvent.dragOver(heading(), { dataTransfer: dt2 });
    fireEvent.drop(heading(), { dataTransfer: dt2 });
    assert.equal(moves, 1);
    assert.equal(database("d2")?.folderId, null);
    assert.equal(heading().hasAttribute("data-drop-target"), false);
  } finally {
    await act(async () => {
      useStudioStore.setState({ moveFileDatabase: original });
    });
  }
});

test("dropping .pgn files from the computer on a folder imports them there exactly once", async () => {
  seed([ROOT_FILE], "f3");
  await renderView();
  const before = databases().length;
  const root = screen.getByTestId("library-view");
  const dt = transfer({ files: [pgnFile("Dropped.pgn")] });

  fireEvent.dragEnter(root, { dataTransfer: dt });
  assert.ok(screen.getByTestId("library-drop-overlay"), "the Library overlay shows during the drag");
  fireEvent.drop(folderButton("Openings"), { dataTransfer: dt });
  // The root must not import the same drop again, but its overlay still resets.
  assert.equal(screen.queryByTestId("library-drop-overlay"), null);
  await settle();

  assert.equal(databases().length, before + 1);
  const imported = databases().find((item) => item.name === "Dropped");
  assert.equal(imported?.folderId, "f1", "not the folder being viewed");
  assert.equal(useImportQueue.getState().entries.length, 1);
  assert.equal(useImportQueue.getState().entries[0]?.state, "done");
});

test("a folder drop asks the usual name-conflict question and keeps the target folder", async () => {
  seed([db("dup", "Dup", null), ROOT_FILE]);
  await renderView();
  const dt = transfer({ files: [pgnFile("Dup.pgn")] });
  fireEvent.drop(folderButton("Endings"), { dataTransfer: dt });
  await settle();

  assert.ok(screen.getByTestId("library-import-conflict").textContent?.includes("Dup"));
  await act(async () => {
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep both" }));
  });
  await settle();
  const born = databases();
  assert.equal(born.length, 3, "Keep both adds a second Dup file next to the two seeded files");
  assert.equal(born.find((item) => item.name === "Dup (2)")?.folderId, "f3");
});

test("a second folder drop while another file imports still lands in its own folder", async () => {
  seed([ROOT_FILE]);
  await renderView();
  let release: (text: string) => void = () => {};
  const slow = pgnFile("Slow.pgn");
  slow.text = () => new Promise<string>((resolve) => { release = resolve; });

  fireEvent.drop(folderButton("Openings"), { dataTransfer: transfer({ files: [slow] }) });
  fireEvent.drop(folderButton("Endings"), { dataTransfer: transfer({ files: [pgnFile("Fast.pgn")] }) });
  await act(async () => { release(PGN); });
  await settle();

  assert.equal(databases().find((item) => item.name === "Slow")?.folderId, "f1");
  assert.equal(databases().find((item) => item.name === "Fast")?.folderId, "f3");
});

test("dropping files on the folder they are already in does nothing", async () => {
  seed([FOLDER_FILE]);
  await renderView();

  let moves = 0;
  const original = useStudioStore.getState().moveFileDatabase;
  await act(async () => {
    useStudioStore.setState({
      moveFileDatabase: (id, folderId) => {
        moves += 1;
        original(id, folderId);
      },
    });
  });
  try {
    const dt = startDatabaseDrag(/^Open file/, "d2");
    fireEvent.dragOver(folderButton("Openings"), { dataTransfer: dt });
    fireEvent.drop(folderButton("Openings"), { dataTransfer: dt });
    assert.equal(moves, 0);
    assert.equal(database("d2")?.folderId, "f1");
  } finally {
    await act(async () => {
      useStudioStore.setState({ moveFileDatabase: original });
    });
  }
});

test("dropping non-.pgn files on a folder is refused with the existing message", async () => {
  seed([ROOT_FILE], "f3");
  await renderView();
  const before = databases().length;
  const dt = transfer({ files: [new File(["hello"], "notes.txt")] });
  fireEvent.drop(folderButton("Endings"), { dataTransfer: dt });
  await settle();

  assert.equal(databases().length, before);
  assert.match(useStudioStore.getState().statusMessage ?? "", /Skipped \(not \.pgn\): notes\.txt/);
});

test("a drop elsewhere in the Library still imports into the folder being viewed", async () => {
  seed([ROOT_FILE], "f3");
  await renderView();
  const dt = transfer({ files: [pgnFile("Elsewhere.pgn")] });
  fireEvent.drop(screen.getByTestId("library-view"), { dataTransfer: dt });
  await settle();
  assert.equal(databases().find((item) => item.name === "Elsewhere")?.folderId, "f3");
});

test("a collapsed folder opens after the pointer rests on it, and leaving cancels it", async (t) => {
  seed([ROOT_FILE, FOLDER_FILE]);
  await renderView();
  fireEvent.click(folderButton("Collapse Openings"));
  assert.equal(screen.queryByRole("button", { name: /^Open file/ }), null);
  t.mock.timers.enable({ apis: ["setTimeout"] });

  const dt = startDatabaseDrag(/^Root file/, "d1");
  fireEvent.dragOver(folderButton("Openings"), { dataTransfer: dt });
  assert.equal(folderButton("Expand Openings").getAttribute("aria-expanded"), "false");
  assert.equal(folderRow("Openings").getAttribute("data-drop-target"), "");
  // A second dragover must not restart the wait.
  fireEvent.dragOver(folderButton("Openings"), { dataTransfer: dt });
  await act(async () => { t.mock.timers.tick(FOLDER_EXPAND_DELAY_MS); });
  assert.equal(folderButton("Collapse Openings").getAttribute("aria-expanded"), "true");
  assert.ok(card(/^Open file/), "the folder's files are reachable for the drop");

  fireEvent.click(folderButton("Collapse Openings"));
  fireEvent.dragOver(folderButton("Openings"), { dataTransfer: dt });
  fireEvent.dragLeave(folderButton("Openings"), { dataTransfer: dt });
  assert.equal(folderRow("Openings").hasAttribute("data-drop-target"), false);
  await act(async () => { t.mock.timers.tick(FOLDER_EXPAND_DELAY_MS); });
  assert.equal(folderButton("Expand Openings").getAttribute("aria-expanded"), "false");
});

test("Move to folder… in the file menu still moves the file", async () => {
  seed([ROOT_FILE]);
  await renderView();
  fireEvent.click(within(rowOf(/^Root file/)).getByTestId("library-source-menu"));
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to folder…" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Endings" }));
  assert.equal(database("d1")?.folderId, "f3");
  assert.equal(screen.queryByRole("dialog"), null);
});
