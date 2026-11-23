"use client";

import { useEffect, useRef } from "react";
import { fileSourceId, syncFileSources } from "@/src/lib/library/file-source";
import { createMyGamesSource } from "@/src/lib/library/my-games-source";
import { MASTERS_SOURCE_ID, mastersSource } from "@/src/lib/library/masters-source";
import { xdDatabaseSource } from "@/src/lib/library/xd-database-source";
import { getLibrarySource, registerLibrarySource } from "@/src/lib/library/sources";
import type { LibrarySourceId } from "@/src/lib/library/types";
import { getDescendantFolderIds, type FileDatabase, type FileFolder } from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "./library-store";

/**
 * Next source selection after the available sources change.
 * - First run: select every available source.
 * - Later runs: keep the user's choice, drop sources that no longer exist.
 *   If nothing is left, fall back to every available source.
 * - SIG-1337: an empty selection made on purpose (viewing an empty folder,
 *   `keepEmpty`) stays empty, so the table keeps showing that folder.
 * - SIG-1343: once that folder gains a file (drop/import), its sources are
 *   selected, so the table stops showing "this folder has no PGN files yet".
 */
export function reconcileLibrarySources(
  current: LibrarySourceId[],
  available: LibrarySourceId[],
  firstRun: boolean,
  keepEmpty = false,
  folderSources: LibrarySourceId[] = [],
): LibrarySourceId[] {
  if (firstRun) {
    return available;
  }
  if (keepEmpty && current.length === 0) {
    return folderSources.length > 0 ? folderSources : current;
  }
  const kept = current.filter((id) => available.includes(id));
  return kept.length > 0 ? kept : available;
}

function sameIds(a: LibrarySourceId[], b: LibrarySourceId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Registers the My Games, Masters (SIG-1276) and Imported PGN adapters once. */
export function registerLibraryAdapters(databases: FileDatabase[]): LibrarySourceId[] {
  if (!getLibrarySource("my-games")) {
    registerLibrarySource(createMyGamesSource());
  }
  if (!getLibrarySource(MASTERS_SOURCE_ID)) {
    registerLibrarySource(mastersSource);
  }
  if (!getLibrarySource(xdDatabaseSource.id)) {
    registerLibrarySource(xdDatabaseSource);
  }
  syncFileSources(databases);
  return ["my-games", MASTERS_SOURCE_ID, xdDatabaseSource.id, ...databases.map((database) => fileSourceId(database.id))];
}

/** File sources inside a folder (and its subfolders), restricted to `available`. */
export function fileSourcesInFolder(
  folderId: string,
  available: LibrarySourceId[],
  databases: FileDatabase[],
  folders: FileFolder[],
): LibrarySourceId[] {
  const scope = new Set([folderId, ...getDescendantFolderIds(folders, folderId)]);
  return available.filter((id) => {
    if (!id.startsWith("file:")) {
      return false;
    }
    const database = databases.find((item) => fileSourceId(item.id) === id);
    return database?.folderId ? scope.has(database.folderId) : false;
  });
}

/**
 * Keeps the adapter registry and the selected sources in step with the store's
 * personal databases.
 */
export function useLibrarySources(): void {
  const databases = useStudioStore((state) => state.files.databases);
  const filesHydrated = useStudioStore((state) => state.filesHydrated);
  const firstRun = useRef(true);

  useEffect(() => {
    // Include all stored PGNs when initializing the default source selection.
    if (!filesHydrated) return;

    const available = registerLibraryAdapters(databases);
    const { filters, setSources, folderId } = useLibraryStore.getState();
    const state = useStudioStore.getState();
    // Viewing a folder that still exists: its empty selection is intentional.
    const viewingFolder =
      folderId !== null && state.files.folders.some((folder) => folder.id === folderId);
    const folderSources =
      folderId !== null
        ? fileSourcesInFolder(folderId, available, databases, state.files.folders)
        : [];
    const next = reconcileLibrarySources(
      filters.sources,
      available,
      firstRun.current,
      viewingFolder,
      folderSources,
    );
    firstRun.current = false;
    if (!sameIds(next, filters.sources)) {
      setSources(next);
    }
  }, [databases, filesHydrated]);
}

/** Plain click: select only this source. */
export function selectOnly(id: LibrarySourceId): LibrarySourceId[] {
  return [id];
}

/** Ctrl/⌘-click: add or remove a source; the last selected source stays. */
export function toggleSource(
  current: LibrarySourceId[],
  id: LibrarySourceId,
  available: LibrarySourceId[],
): LibrarySourceId[] {
  if (!current.includes(id)) {
    return [...current, id];
  }
  const live = current.filter((other) => available.includes(other));
  return live.length <= 1 ? current : current.filter((other) => other !== id);
}

/** The "All" chip: every available source. */
export function selectAll(available: LibrarySourceId[]): LibrarySourceId[] {
  return [...available];
}
