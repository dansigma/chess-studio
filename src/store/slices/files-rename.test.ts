import assert from "node:assert/strict";
import test from "node:test";
import { useStudioStore } from "../studio-store.ts";

const db = (id: string, name: string) => ({ id, remoteId: null, name, folderId: null, games: [] });

test("renameFileDatabase trims and renames only the target database", () => {
  useStudioStore.setState((s) => ({ files: { ...s.files, databases: [db("a", "One"), db("b", "Two")] }, user: null }));
  useStudioStore.getState().renameFileDatabase("a", "  Renamed  ");
  assert.deepEqual(
    useStudioStore.getState().files.databases.map((d) => d.name),
    ["Renamed", "Two"],
  );
});

test("renameFileDatabase refuses an empty name and ignores unknown ids", () => {
  useStudioStore.setState((s) => ({ files: { ...s.files, databases: [db("a", "One")] }, user: null }));
  useStudioStore.getState().renameFileDatabase("a", "   ");
  useStudioStore.getState().renameFileDatabase("zzz", "X");
  assert.equal(useStudioStore.getState().files.databases[0].name, "One");
});

test("deleteFileDatabase falls the selection back to masters", () => {
  useStudioStore.setState((s) => ({
    files: { ...s.files, databases: [db("a", "One")] },
    databaseSource: "file:a" as never,
    user: null,
  }));
  useStudioStore.getState().deleteFileDatabase("a");
  assert.equal(useStudioStore.getState().files.databases.length, 0);
  assert.equal(useStudioStore.getState().databaseSource, "masters");
});
