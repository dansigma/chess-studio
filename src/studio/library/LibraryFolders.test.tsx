// SIG-1325: folders, paste PGN and account refresh inside the Library source bar.
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

let supabaseCalls = 0;
mock.module("@/src/lib/supabase/client", {
  namedExports: {
    createBrowserSupabase: () => {
      supabaseCalls += 1;
      return null;
    },
  },
});

const { LibrarySourceBar } = await import("./LibrarySourceBar");
const { LibraryView } = await import("./LibraryView");
const { useLibraryStore } = await import("./library-store");
const { resetImportQueue } = await import("./import-queue-store");
const { useStudioStore } = await import("@/src/store/studio-store");
const { DEFAULT_LIBRARY_FILTERS } = await import("@/src/lib/library/types");
const { clearLibrarySources } = await import("@/src/lib/library/sources");
const { registerLibraryAdapters } = await import("./library-sources");
const { FOLDER_CYCLE_MESSAGE } = await import("@/src/lib/user-files");

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  resetImportQueue();
});

const PGN = '[Event "t"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n';
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
const db = (id: string, name: string, folderId: string | null) =>
  ({ id, remoteId: null, name, folderId, games: [] }) as never;

function seed(user: { id: string; email: string | null } | null = null) {
  useStudioStore.setState((s) => ({
    user,
    activity: "boards",
    settings: { ...s.settings, locale: "en" },
    files: {
      folders: [
        { id: "f1", name: "Openings", parentId: null },
        { id: "f2", name: "Sicilian", parentId: "f1" },
        { id: "f3", name: "Endings", parentId: null },
      ],
      databases: [db("d1", "Root file", null), db("d2", "Open file", "f1"), db("d3", "Sicilian file", "f2"), db("d4", "End file", "f3")],
    },
  }));
  useLibraryStore.setState({ folderId: null, filters: { ...DEFAULT_LIBRARY_FILTERS, sources: ["file:d1"] } });
}

beforeEach(() => {
  supabaseCalls = 0;
  seed();
  clearLibrarySources();
  registerLibraryAdapters(useStudioStore.getState().files.databases);
});

const renderBar = async () => {
  render(<LibrarySourceBar sourceErrors={{}} />);
  await act(async () => { await Promise.resolve(); });
};
const cardNames = () => screen.queryAllByTestId("library-source-card").map((c) => c.textContent ?? "");
const select = () => screen.getByRole("combobox", { name: "Folder" }) as HTMLSelectElement;
const openFolders = () => fireEvent.click(screen.getByRole("button", { name: "Folders" }));
const folders = () => useStudioStore.getState().files.folders;

test("the folder selector lists subfolders indented and limits the file cards, subfolders included", async () => {
  await renderBar();
  assert.equal(cardNames().filter((n) => n.includes("file")).length, 4);
  assert.deepEqual(
    Array.from(select().options).map((o) => o.textContent),
    ["All folders", "Openings", "  Sicilian", "Endings"],
  );
  fireEvent.change(select(), { target: { value: "f1" } });
  assert.deepEqual(cardNames().filter((n) => n.includes("file")).map((n) => n.replace(/\d+ games?$/, "")), ["Open file", "Sicilian file"]);
  fireEvent.change(select(), { target: { value: "f2" } });
  assert.equal(cardNames().filter((n) => n.includes("file")).length, 1);
  fireEvent.change(select(), { target: { value: "" } });
  assert.equal(cardNames().filter((n) => n.includes("file")).length, 4);
});

test("Folders menu creates a folder and a subfolder", async () => {
  await renderBar();
  openFolders();
  assert.equal(screen.getByRole("menuitem", { name: "New subfolder…" }).hasAttribute("disabled"), true);
  fireEvent.click(screen.getByRole("menuitem", { name: "New folder…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), { target: { value: "Tactics" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  const created = folders().find((f) => f.name === "Tactics");
  assert.ok(created);
  assert.equal(created.parentId, null);
  assert.equal(useStudioStore.getState().activity, "boards", "no side panel opens");

  fireEvent.change(select(), { target: { value: "f3" } });
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "New subfolder…" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), { target: { value: "Rooks" } });
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  assert.equal(folders().find((f) => f.name === "Rooks")?.parentId, "f3");
});

test("renaming the selected folder", async () => {
  await renderBar();
  fireEvent.change(select(), { target: { value: "f3" } });
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename folder…" }));
  const input = screen.getByRole("textbox", { name: "Folder name" }) as HTMLInputElement;
  assert.equal(input.value, "Endings");
  fireEvent.change(input, { target: { value: "Endgames" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  assert.equal(folders().find((f) => f.id === "f3")?.name, "Endgames");
});

test("deleting a folder asks first, removes subfolders and keeps the files", async () => {
  await renderBar();
  fireEvent.change(select(), { target: { value: "f1" } });
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete folder…" }));
  assert.equal(folders().length, 3, "nothing is deleted before confirming");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  assert.equal(folders().length, 3);
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete folder…" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
  assert.deepEqual(folders().map((f) => f.id), ["f3"]);
  const files = useStudioStore.getState().files.databases;
  assert.equal(files.length, 4);
  assert.equal(files.find((d) => d.id === "d3")?.folderId, null);
  assert.equal(useLibraryStore.getState().folderId, null);
});

test("moving a folder: cycle targets are disabled and the store refuses them", async () => {
  await renderBar();
  fireEvent.change(select(), { target: { value: "f1" } });
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Move folder…" }));
  const dialog = within(screen.getByRole("dialog"));
  assert.equal(dialog.getByRole("button", { name: "Openings" }).hasAttribute("disabled"), true);
  assert.equal(dialog.getByRole("button", { name: "Sicilian" }).hasAttribute("disabled"), true);
  assert.equal(dialog.getByRole("button", { name: "Top level (no folder)" }).hasAttribute("disabled"), true);
  assert.equal(useStudioStore.getState().moveFileFolder("f1", "f2"), false);
  assert.equal(FOLDER_CYCLE_MESSAGE.length > 0, true);
  fireEvent.click(dialog.getByRole("button", { name: "Endings" }));
  assert.equal(folders().find((f) => f.id === "f1")?.parentId, "f3");

  fireEvent.change(select(), { target: { value: "f2" } });
  openFolders();
  fireEvent.click(screen.getByRole("menuitem", { name: "Move folder…" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Top level (no folder)" }));
  assert.equal(folders().find((f) => f.id === "f2")?.parentId, null);
});

test("Move to folder… on a file card moves it, and No folder takes it out", async () => {
  await renderBar();
  const cardMenu = () => screen.getAllByTestId("library-source-menu")[0];
  fireEvent.click(cardMenu());
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to folder…" }));
  const dialog = within(screen.getByRole("dialog"));
  assert.equal(dialog.getByRole("button", { name: "No folder" }).hasAttribute("disabled"), true);
  fireEvent.click(dialog.getByRole("button", { name: "Endings" }));
  assert.equal(useStudioStore.getState().files.databases.find((d) => d.id === "d1")?.folderId, "f3");
  assert.equal(screen.queryByRole("dialog"), null);
  fireEvent.click(cardMenu());
  fireEvent.click(screen.getByRole("menuitem", { name: "Move to folder…" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "No folder" }));
  assert.equal(useStudioStore.getState().files.databases.find((d) => d.id === "d1")?.folderId, null);
});

test("Refresh from account shows only when signed in and fetches then", async () => {
  await renderBar();
  openFolders();
  assert.equal(screen.queryByRole("menuitem", { name: "Refresh from account" }), null);
  cleanup();
  act(() => { seed({ id: "u1", email: null }); });
  await renderBar();
  openFolders();
  const before = supabaseCalls;
  await act(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "Refresh from account" })); });
  await settle();
  assert.ok(supabaseCalls > before, "loadRemoteFiles ran");
  assert.equal(useStudioStore.getState().statusMessage, "Files refreshed");
});

test("the import button offers From file… and Paste PGN", async () => {
  await renderBar();
  fireEvent.click(screen.getByRole("button", { name: "+ Import PGN" }));
  assert.deepEqual(screen.getAllByRole("menuitem").map((i) => i.textContent), ["From file…", "Paste PGN"]);
});

test("Paste PGN imports through the queue into the viewed folder", async () => {
  useStudioStore.setState((s) => ({ files: { ...s.files, databases: [] } }));
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
  useStudioStore.setState((s) => ({
    files: { ...s.files, databases: [{ id: "x", remoteId: null, name: "Dup", folderId: null, games: [] }] as never },
  }));
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

test("pt-BR strings", async () => {
  useStudioStore.setState((s) => ({ settings: { ...s.settings, locale: "pt-br" } }));
  await renderBar();
  const sel = screen.getByRole("combobox", { name: "Pasta" }) as HTMLSelectElement;
  assert.equal(sel.options[0].textContent, "Todas as pastas");
  assert.ok(screen.getByRole("button", { name: "Pastas" }));
});
