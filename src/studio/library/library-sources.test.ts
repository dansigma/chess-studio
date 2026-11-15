import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileSourcesInFolder, reconcileLibrarySources, selectAll, selectOnly, toggleSource } from "./library-sources";
import type { LibrarySourceId } from "@/src/lib/library/types";

describe("reconcileLibrarySources", () => {
  it("selects every available source on the first run", () => {
    assert.deepEqual(reconcileLibrarySources(["my-games"], ["my-games", "file:a"], true), ["my-games", "file:a"]);
  });

  it("keeps the user's choice and drops removed databases", () => {
    assert.deepEqual(reconcileLibrarySources(["file:a", "file:b"], ["my-games", "file:a"], false), ["file:a"]);
  });

  it("does not add new databases to a chosen selection", () => {
    assert.deepEqual(reconcileLibrarySources(["my-games"], ["my-games", "file:c"], false), ["my-games"]);
  });

  it("falls back to every source when nothing chosen is left", () => {
    assert.deepEqual(reconcileLibrarySources(["file:gone"], ["my-games", "file:a"], false), ["my-games", "file:a"]);
  });

  it("keeps an intentional empty selection (viewing an empty folder)", () => {
    assert.deepEqual(reconcileLibrarySources([], ["my-games", "file:a"], false, true), []);
    // Only an empty selection is kept as is; a stale one still falls back.
    assert.deepEqual(reconcileLibrarySources(["file:gone"], ["my-games", "file:a"], false, true), ["my-games", "file:a"]);
    // Without a folder in view, an empty selection still falls back.
    assert.deepEqual(reconcileLibrarySources([], ["my-games", "file:a"], false, false), ["my-games", "file:a"]);
  });

  it("selects the viewed folder's files once the folder stops being empty (SIG-1343)", () => {
    assert.deepEqual(
      reconcileLibrarySources([], ["my-games", "masters", "file:a"], false, true, ["file:a"]),
      ["file:a"],
    );
    // A non-empty selection is still the user's choice.
    assert.deepEqual(
      reconcileLibrarySources(["my-games"], ["my-games", "file:a"], false, true, ["file:a"]),
      ["my-games"],
    );
  });
});

describe("fileSourcesInFolder", () => {
  const folders = [
    { id: "f1", name: "Prep", parentId: null },
    { id: "f2", name: "Nested", parentId: "f1" },
    { id: "f3", name: "Other", parentId: null },
  ];
  const database = (id: string, folderId: string | null) =>
    ({ id, remoteId: null, name: id, folderId, games: [] }) as never;

  it("returns file sources from the folder and its subfolders, in `available` order", () => {
    const available: LibrarySourceId[] = ["my-games", "masters", "file:a", "file:b", "file:c", "file:d"];
    const databases = [database("a", "f2"), database("b", null), database("c", "f3"), database("d", "f1")];
    assert.deepEqual(fileSourcesInFolder("f1", available, databases, folders), ["file:a", "file:d"]);
  });

  it("is empty for a folder with no files", () => {
    const available: LibrarySourceId[] = ["my-games", "file:a"];
    assert.deepEqual(fileSourcesInFolder("f3", available, [database("a", null)], folders), []);
  });
});

describe("registerLibraryAdapters", () => {
  it("registers My Games, Masters and one source per personal database", async () => {
    const { registerLibraryAdapters } = await import("./library-sources");
    const { getLibrarySource } = await import("@/src/lib/library/sources");
    const ids = registerLibraryAdapters([{ id: "db1", name: "Mine", folderId: null, games: [] } as never]);
    assert.deepEqual(ids, ["my-games", "masters", "file:db1"]);
    for (const id of ids) {
      assert.ok(getLibrarySource(id), `${id} is registered`);
    }
  });
});

describe("selection helpers", () => {
  const all: LibrarySourceId[] = ["my-games", "masters", "file:a"];
  it("selectOnly picks a single source", () => {
    assert.deepEqual(selectOnly("masters"), ["masters"]);
  });
  it("toggleSource adds and removes", () => {
    assert.deepEqual(toggleSource(["my-games"], "masters", all), ["my-games", "masters"]);
    assert.deepEqual(toggleSource(["my-games", "masters"], "masters", all), ["my-games"]);
  });
  it("toggleSource keeps the last selected source", () => {
    assert.deepEqual(toggleSource(["my-games"], "my-games", all), ["my-games"]);
  });
  it("selectAll returns every available source", () => {
    assert.deepEqual(selectAll(all), all);
  });
});
