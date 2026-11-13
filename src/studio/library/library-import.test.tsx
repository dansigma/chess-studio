import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryView } from "./LibraryView";
import { LibrarySourceBar } from "./LibrarySourceBar";
import { useLibraryStore } from "./library-store";
import { useStudioStore } from "@/src/store/studio-store";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

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
  useStudioStore.setState({ activity: "explorer" } as never);
  await act(async () => { render(<LibraryView />); });
  const root = screen.getByTestId("library-view");
  await act(async () => {
    fireEvent.drop(root, { dataTransfer: dt([pgnFile("First.pgn"), pgnFile("notes.txt"), pgnFile("Second.PGN")]) });
  });
  await settle();
  const dbs = useStudioStore.getState().files.databases;
  assert.equal(dbs.length, before + 2);
  assert.deepEqual(dbs.slice(-2).map((d) => d.name), ["First", "Second"]);
  assert.notEqual(useStudioStore.getState().activity, "files");
  assert.deepEqual(useLibraryStore.getState().filters.sources, [`file:${dbs[dbs.length - 1].id}`]);
  assert.match(useStudioStore.getState().statusMessage ?? "", /notes\.txt/);
});

test("the Import PGN button opens a multiple .pgn input", async () => {
  await act(async () => { render(<LibrarySourceBar sourceErrors={{}} />); });
  assert.ok(screen.getByRole("button", { name: "+ Import PGN" }));
  const input = screen.getByTestId("library-import-input") as HTMLInputElement;
  assert.equal(input.accept, ".pgn");
  assert.equal(input.multiple, true);
});
