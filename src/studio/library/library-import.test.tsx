import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryView } from "./LibraryView";
import { LibrarySourceBar } from "./LibrarySourceBar";
import { resetImportQueue, useImportQueue } from "./import-queue-store";
import { useLibraryStore } from "./library-store";
import { useStudioStore } from "@/src/store/studio-store";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => {
  cleanup();
  resetImportQueue();
});

const PGN = '[Event "t"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n';
const pgnFile = (name: string) => new File([PGN], name);
const dt = (files: File[], types = ["Files"]) => ({ types, files, dropEffect: "none" });
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });

test("overlay shows only for file drags and hides on leave and drop", async () => {
  await act(async () => { render(<LibraryView />); });
  const root = screen.getByTestId("library-view");
  fireEvent.dragEnter(root, { dataTransfer: dt([], ["text/plain"]) });
  assert.equal(screen.queryByTestId("library-drop-overlay"), null);
  fireEvent.dragEnter(root, { dataTransfer: dt([]) });
  assert.ok(screen.getByTestId("library-drop-overlay"));
  // nested enter/leave does not flicker
  fireEvent.dragEnter(root, { dataTransfer: dt([]) });
  fireEvent.dragLeave(root, { dataTransfer: dt([]) });
  assert.ok(screen.getByTestId("library-drop-overlay"));
  fireEvent.dragLeave(root, { dataTransfer: dt([]) });
  assert.equal(screen.queryByTestId("library-drop-overlay"), null);
  fireEvent.dragEnter(root, { dataTransfer: dt([]) });
  fireEvent.drop(root, { dataTransfer: dt([]) });
  assert.equal(screen.queryByTestId("library-drop-overlay"), null);
});

test("dropping files imports each without focusing Files and selects the last one", async () => {
  const before = useStudioStore.getState().files.databases.length;
  useStudioStore.setState({ activity: "boards" });
  await act(async () => { render(<LibraryView />); });
  const root = screen.getByTestId("library-view");
  await act(async () => {
    fireEvent.drop(root, { dataTransfer: dt([pgnFile("First.pgn"), pgnFile("notes.txt"), pgnFile("Second.PGN")]) });
  });
  await settle();
  const dbs = useStudioStore.getState().files.databases;
  assert.equal(dbs.length, before + 2);
  assert.deepEqual(dbs.slice(-2).map((d) => d.name), ["First", "Second"]);
  assert.equal(useStudioStore.getState().activity, "boards");
  assert.deepEqual(useLibraryStore.getState().filters.sources, [`file:${dbs[dbs.length - 1].id}`]);
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.state), ["done", "done"]);
  const status = useStudioStore.getState().statusMessage ?? "";
  // The skipped note is appended to the import's own success message, not replacing it.
  assert.match(status, /notes\.txt/);
  assert.match(status, /Imported \d+ game/);
});

test("the Import PGN button opens a multiple .pgn input", async () => {
  await act(async () => { render(<LibrarySourceBar sourceErrors={{}} />); });
  assert.ok(screen.getByRole("button", { name: "+ Import PGN" }));
  const input = screen.getByTestId("library-import-input") as HTMLInputElement;
  assert.equal(input.accept, ".pgn");
  assert.equal(input.multiple, true);
});

test("a file that cannot be read shows as failed in the widget and the rest still imports", async () => {
  const before = useStudioStore.getState().files.databases.length;
  const broken = pgnFile("broken.pgn");
  broken.text = () => Promise.reject(new Error("read error"));
  await act(async () => { render(<LibraryView />); });
  await act(async () => {
    fireEvent.drop(screen.getByTestId("library-view"), { dataTransfer: dt([broken, pgnFile("Ok.pgn")]) });
  });
  await settle();
  assert.equal(useStudioStore.getState().files.databases.length, before + 1);
  const widget = screen.getByTestId("library-import-widget");
  assert.match(widget.textContent ?? "", /broken\.pgn/);
  assert.match(widget.textContent ?? "", /Could not read this file/);
  assert.ok(screen.getByRole("button", { name: "Close" }));
});

test("a file named like an existing database opens the dialog; Replace keeps the id and Esc skips only that file", async () => {
  const game = { id: "old", white: "A", black: "B", result: "1-0", event: "", date: "", pgn: PGN, title: "" };
  useStudioStore.setState((s) => ({
    files: { ...s.files, databases: [{ id: "dup", remoteId: null, name: "Dup", folderId: null, games: [game] }] },
    user: null,
  }));
  await act(async () => { render(<LibraryView />); });
  const root = screen.getByTestId("library-view");
  await act(async () => {
    fireEvent.drop(root, { dataTransfer: dt([pgnFile("dup.pgn"), pgnFile("fresh.pgn")]) });
  });
  await settle();
  assert.ok(screen.getByRole("dialog"));
  assert.ok(screen.getByTestId("library-import-conflict").textContent?.includes("Dup"));
  assert.equal(screen.getAllByTestId("library-import-entry")[0].getAttribute("data-state"), "awaiting");
  assert.equal(useStudioStore.getState().files.databases.length, 1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Replace" })); });
  await settle();
  assert.equal(screen.queryByRole("dialog"), null);
  const dbs = useStudioStore.getState().files.databases;
  assert.deepEqual(dbs.map((d) => d.id).slice(0, 1), ["dup"]);
  assert.notEqual(dbs[0].games[0].id, "old");
  assert.deepEqual(dbs.map((d) => d.name), ["Dup", "fresh"]);
  assert.deepEqual(useLibraryStore.getState().filters.sources, [`file:${dbs[1].id}`]);
});

test("Esc in the conflict dialog cancels that file and the next one imports", async () => {
  useStudioStore.setState((s) => ({
    files: { ...s.files, databases: [{ id: "dup", remoteId: null, name: "Dup", folderId: null, games: [] }] },
    user: null,
  }));
  await act(async () => { render(<LibraryView />); });
  await act(async () => {
    fireEvent.drop(screen.getByTestId("library-view"), { dataTransfer: dt([pgnFile("Dup.pgn"), pgnFile("next.pgn")]) });
  });
  await settle();
  await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
  await settle();
  assert.deepEqual(useStudioStore.getState().files.databases.map((d) => d.name), ["Dup", "next"]);
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.state), ["cancelled", "done"]);
});
