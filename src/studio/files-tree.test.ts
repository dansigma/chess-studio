import assert from "node:assert/strict";
import test from "node:test";
import { buildFolderTree, matchesDatabase } from "./files-tree";
import type { FileDatabase, FileFolder } from "@/src/lib/user-files";

function folder(id: string, name: string, parentId: string | null = null): FileFolder {
  return { id, name, parentId };
}

function database(
  id: string,
  name: string,
  folderId: string | null = null,
  white = "Player 1",
  black = "Player 2",
  event = "Tournament",
): FileDatabase {
  return {
    id,
    remoteId: null,
    name,
    folderId,
    games: [
      {
        id: `game-${id}`,
        title: `${white} vs ${black}`,
        white,
        black,
        event,
        date: "2026.01.01",
        result: "1-0",
        pgn: "",
      },
    ],
  };
}

test("buildFolderTree creates nested folder hierarchy and places databases correctly", () => {
  const folders: FileFolder[] = [
    folder("f1", "Openings", null),
    folder("f2", "1. e4", "f1"),
    folder("f3", "Sicilian", "f2"),
    folder("f4", "Endgames", null),
  ];
  const databases: FileDatabase[] = [
    database("d1", "Najdorf", "f3"),
    database("d2", "French", "f2"),
    database("d3", "Rook Endgames", "f4"),
    database("d4", "Root DB", null),
  ];

  const tree = buildFolderTree(folders, databases, "");

  // Root databases
  assert.equal(tree.rootDatabases.length, 1);
  assert.equal(tree.rootDatabases[0].id, "d4");

  // Root folders
  assert.equal(tree.rootFolders.length, 2);
  const openingsNode = tree.rootFolders.find((n) => n.folder.id === "f1")!;
  assert.ok(openingsNode);
  assert.equal(openingsNode.children.length, 1);

  const e4Node = openingsNode.children[0];
  assert.equal(e4Node.folder.id, "f2");
  assert.equal(e4Node.databases.length, 1);
  assert.equal(e4Node.databases[0].id, "d2");
  assert.equal(e4Node.children.length, 1);

  const sicilianNode = e4Node.children[0];
  assert.equal(sicilianNode.folder.id, "f3");
  assert.equal(sicilianNode.databases.length, 1);
  assert.equal(sicilianNode.databases[0].id, "d1");

  // Folder options for moving items
  assert.deepEqual(
    tree.folderOptions.map((o) => ({ id: o.id, depth: o.depth })),
    [
      { id: "f1", depth: 0 },
      { id: "f2", depth: 1 },
      { id: "f3", depth: 2 },
      { id: "f4", depth: 0 },
    ],
  );
});

test("buildFolderTree filters tree by query and keeps ancestor folders intact", () => {
  const folders: FileFolder[] = [
    folder("f1", "Openings", null),
    folder("f2", "1. e4", "f1"),
    folder("f3", "Sicilian", "f2"),
    folder("f4", "Endgames", null),
  ];
  const databases: FileDatabase[] = [
    database("d1", "Najdorf Variations", "f3", "Kasparov", "Karpov"),
    database("d2", "French Defense", "f2"),
    database("d3", "Pawn Endgames", "f4"),
  ];

  // Search by player name in a nested database
  const tree1 = buildFolderTree(folders, databases, "Kasparov");
  assert.equal(tree1.rootFolders.length, 1);
  assert.equal(tree1.rootFolders[0].folder.id, "f1");
  assert.equal(tree1.rootFolders[0].children[0].folder.id, "f2");
  assert.equal(tree1.rootFolders[0].children[0].children[0].folder.id, "f3");
  assert.equal(tree1.rootFolders[0].children[0].children[0].databases[0].id, "d1");
  // Non-matching sibling French Defense should not be in f2 databases
  assert.equal(tree1.rootFolders[0].children[0].databases.length, 0);

  // Search by folder name
  const tree2 = buildFolderTree(folders, databases, "Sicilian");
  assert.equal(tree2.rootFolders.length, 1);
  assert.equal(tree2.rootFolders[0].folder.id, "f1");
  assert.equal(tree2.rootFolders[0].children[0].children[0].folder.id, "f3");
});

test("matchesDatabase matches name, white, black, or event", () => {
  const db = database("d1", "My Games", null, "Carlsen", "Nakamura", "World Blitz");
  assert.equal(matchesDatabase(db, "carlsen"), true);
  assert.equal(matchesDatabase(db, "nakamura"), true);
  assert.equal(matchesDatabase(db, "blitz"), true);
  assert.equal(matchesDatabase(db, "games"), true);
  assert.equal(matchesDatabase(db, "anand"), false);
});
