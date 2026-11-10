"use client";

import { useEffect, useRef } from "react";
import { fileSourceId, syncFileSources } from "@/src/lib/library/file-source";
import { createMyGamesSource } from "@/src/lib/library/my-games-source";
import { getLibrarySource, registerLibrarySource } from "@/src/lib/library/sources";
import type { LibrarySourceId } from "@/src/lib/library/types";
import type { FileDatabase } from "@/src/lib/user-files";
import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "./library-store";

/**
 * Next source selection after the available sources change.
 * - First run: select every available source.
 * - Later runs: keep the user's choice, drop sources that no longer exist.
 *   If nothing is left, fall back to every available source.
 */
export function reconcileLibrarySources(
  current: LibrarySourceId[],
  available: LibrarySourceId[],
  firstRun: boolean,
): LibrarySourceId[] {
  if (firstRun) {
    return available;
  }
  const kept = current.filter((id) => available.includes(id));
  return kept.length > 0 ? kept : available;
}

function sameIds(a: LibrarySourceId[], b: LibrarySourceId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Registers the My Games and Imported PGN adapters (SIG-1272) once. */
export function registerLibraryAdapters(databases: FileDatabase[]): LibrarySourceId[] {
  if (!getLibrarySource("my-games")) {
    registerLibrarySource(createMyGamesSource());
  }
  syncFileSources(databases);
  return ["my-games", ...databases.map((database) => fileSourceId(database.id))];
}

/**
 * Keeps the adapter registry and the selected sources in step with the store's
 * personal databases. Masters (SIG-1276) registers itself when it lands.
 */
export function useLibrarySources(): void {
  const databases = useStudioStore((state) => state.files.databases);
  const firstRun = useRef(true);

  useEffect(() => {
    const available = registerLibraryAdapters(databases);
    const { filters, setSources } = useLibraryStore.getState();
    const next = reconcileLibrarySources(filters.sources, available, firstRun.current);
    firstRun.current = false;
    if (!sameIds(next, filters.sources)) {
      setSources(next);
    }
  }, [databases]);
}
