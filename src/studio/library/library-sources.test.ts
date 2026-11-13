import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconcileLibrarySources, selectAll, selectOnly, toggleSource } from "./library-sources";
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
