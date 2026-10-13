import assert from "node:assert/strict";
import test from "node:test";
import {
  canMoveFolder,
  getDescendantFolderIds,
  isDescendantFolder,
  loadLocalFiles,
  saveLocalFiles,
  type FileFolder,
  type FilesLibrary,
} from "./user-files.ts";
import { useStudioStore } from "../store/studio-store.ts";

test("isDescendantFolder identifies direct and indirect descendants", () => {
  const folders: FileFolder[] = [
    { id: "root", name: "Root", parentId: null },
    { id: "child-1", name: "Child 1", parentId: "root" },
    { id: "child-2", name: "Child 2", parentId: "root" },
    { id: "grandchild", name: "Grandchild", parentId: "child-1" },
    { id: "other", name: "Other Root", parentId: null },
  ];

  assert.equal(isDescendantFolder(folders, "grandchild", "child-1"), true);
  assert.equal(isDescendantFolder(folders, "grandchild", "root"), true);
  assert.equal(isDescendantFolder(folders, "child-1", "root"), true);
  assert.equal(isDescendantFolder(folders, "root", "grandchild"), false);
  assert.equal(isDescendantFolder(folders, "other", "root"), false);
  assert.equal(isDescendantFolder(folders, "root", "root"), false);
});

test("getDescendantFolderIds recursively gathers all child folder ids", () => {
  const folders: FileFolder[] = [
    { id: "a", name: "A", parentId: null },
    { id: "b", name: "B", parentId: "a" },
    { id: "c", name: "C", parentId: "b" },
    { id: "d", name: "D", parentId: "a" },
    { id: "e", name: "E", parentId: null },
  ];

  const descendantsA = Array.from(getDescendantFolderIds(folders, "a")).sort();
  assert.deepEqual(descendantsA, ["b", "c", "d"]);

  const descendantsB = Array.from(getDescendantFolderIds(folders, "b"));
  assert.deepEqual(descendantsB, ["c"]);

  const descendantsC = Array.from(getDescendantFolderIds(folders, "c"));
  assert.deepEqual(descendantsC, []);
});

test("canMoveFolder prevents cycles and invalid targets", () => {
  const folders: FileFolder[] = [
    { id: "f1", name: "Folder 1", parentId: null },
    { id: "f2", name: "Folder 2", parentId: "f1" },
    { id: "f3", name: "Folder 3", parentId: "f2" },
    { id: "f4", name: "Folder 4", parentId: null },
  ];

  // Moving to root is allowed
  assert.equal(canMoveFolder(folders, "f2", null), true);
  // Moving to sibling or other root is allowed
  assert.equal(canMoveFolder(folders, "f3", "f4"), true);
  assert.equal(canMoveFolder(folders, "f4", "f3"), true);

  // Moving into self is blocked
  assert.equal(canMoveFolder(folders, "f1", "f1"), false);
  // Moving parent into its child/descendant is blocked
  assert.equal(canMoveFolder(folders, "f1", "f2"), false);
  assert.equal(canMoveFolder(folders, "f1", "f3"), false);

  // Moving to nonexistent folder is blocked
  assert.equal(canMoveFolder(folders, "f1", "nonexistent"), false);
});

test("localFiles roundtrip preserves parentId and migrates legacy entries", () => {
  const storage = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, String(value)),
      removeItem: (key: string) => storage.delete(key),
    },
  };

  const sample: FilesLibrary = {
    folders: [
      { id: "f1", name: "Top", parentId: null },
      { id: "f2", name: "Sub", parentId: "f1" },
    ],
    databases: [
      { id: "d1", name: "Db 1", folderId: "f2", remoteId: null, games: [] },
    ],
  };

  saveLocalFiles(sample);
  const loaded = loadLocalFiles();
  assert.deepEqual(loaded, sample);

  // Legacy data without parentId
  storage.set(
    "chess-studio:user-files",
    JSON.stringify({
      folders: [{ id: "legacy", name: "Legacy" }],
      databases: [],
    }),
  );
  const legacyLoaded = loadLocalFiles();
  assert.equal(legacyLoaded.folders[0].parentId, null);
});

test("store actions: folder creation, renaming, moving, and cascading deletion", () => {
  // Reset files
  useStudioStore.setState({
    files: {
      folders: [],
      databases: [],
    },
  });

  // Create root folder
  useStudioStore.getState().createFileFolder("Openings");
  const openings = useStudioStore.getState().files.folders.find((f) => f.name === "Openings");
  assert.ok(openings);
  assert.equal(openings.parentId, null);

  // Create subfolder
  useStudioStore.getState().createFileFolder("1. e4", openings.id);
  const e4 = useStudioStore.getState().files.folders.find((f) => f.name === "1. e4");
  assert.ok(e4);
  assert.equal(e4.parentId, openings.id);

  // Create sub-subfolder
  useStudioStore.getState().createFileFolder("Sicilian", e4.id);
  const sicilian = useStudioStore.getState().files.folders.find((f) => f.name === "Sicilian");
  assert.ok(sicilian);
  assert.equal(sicilian.parentId, e4.id);

  // Rename folder
  useStudioStore.getState().renameFileFolder(sicilian.id, "Sicilian Defense");
  const renamedSicilian = useStudioStore.getState().files.folders.find((f) => f.id === sicilian.id);
  assert.equal(renamedSicilian?.name, "Sicilian Defense");

  // Add databases in folders
  useStudioStore.getState().importFileDatabase("Najdorf", "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *", sicilian.id);
  const najdorf = useStudioStore.getState().files.databases.find((d) => d.name === "Najdorf");
  assert.ok(najdorf);
  assert.equal(najdorf.folderId, sicilian.id);

  // Move database to another folder
  useStudioStore.getState().moveFileDatabase(najdorf.id, openings.id);
  const movedNajdorf = useStudioStore.getState().files.databases.find((d) => d.id === najdorf.id);
  assert.equal(movedNajdorf?.folderId, openings.id);

  // Attempt invalid folder move (cycle: move openings into its descendant)
  const cycleResult = useStudioStore.getState().moveFileFolder(openings.id, sicilian.id);
  assert.equal(cycleResult, false);
  assert.equal(
    useStudioStore.getState().files.folders.find((f) => f.id === openings.id)?.parentId,
    null,
  );

  // Valid move: move Sicilian to root
  const validMoveResult = useStudioStore.getState().moveFileFolder(sicilian.id, null);
  assert.equal(validMoveResult, true);
  assert.equal(
    useStudioStore.getState().files.folders.find((f) => f.id === sicilian.id)?.parentId,
    null,
  );

  // Move Sicilian back under e4
  useStudioStore.getState().moveFileFolder(sicilian.id, e4.id);

  // Move Najdorf under Sicilian
  useStudioStore.getState().moveFileDatabase(najdorf.id, sicilian.id);

  // Cascading delete: deleting openings should delete e4 and Sicilian, and unlink Najdorf
  useStudioStore.getState().deleteFileFolder(openings.id);

  const remainingFolders = useStudioStore.getState().files.folders;
  assert.equal(remainingFolders.some((f) => f.id === openings.id), false);
  assert.equal(remainingFolders.some((f) => f.id === e4.id), false);
  assert.equal(remainingFolders.some((f) => f.id === sicilian.id), false);

  const updatedNajdorf = useStudioStore.getState().files.databases.find((d) => d.id === najdorf.id);
  assert.ok(updatedNajdorf);
  assert.equal(updatedNajdorf.folderId, null);
});
