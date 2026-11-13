import { fileExplorerSource, isExplorerSource, fileDatabaseId, type ExplorerSource } from "@/src/lib/explorer-types";
import type { LibrarySourceId } from "@/src/lib/library/types";

/** Library card id -> the Explorer source it would feed; My Games can't be an Explorer source. */
export function libraryToExplorerSource(id: LibrarySourceId): ExplorerSource | null {
  if (id === "masters") {
    return "masters";
  }
  if (id.startsWith("file:")) {
    const databaseId = id.slice("file:".length);
    return databaseId ? fileExplorerSource(databaseId) : null;
  }
  return null;
}

export const REFERENCE_SOURCE_KEY = "chess-studio.explorer.referenceSource";

// Fallback when storage throws, so the choice still holds for this session.
let memory: ExplorerSource | null = null;

export function saveReferenceSource(source: ExplorerSource): void {
  memory = source;
  try {
    window.localStorage.setItem(REFERENCE_SOURCE_KEY, source);
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

export function loadReferenceSource(): ExplorerSource | null {
  try {
    const raw = window.localStorage.getItem(REFERENCE_SOURCE_KEY);
    if (raw !== null) {
      return isExplorerSource(raw) ? raw : null;
    }
  } catch {
    // fall through to memory
  }
  return memory;
}

/**
 * The saved source to use now. A `file:<id>` is kept only if that file exists in the local library
 * at startup; otherwise Masters. (Files that only arrive later from the account are not waited for.)
 */
export function resolveReferenceSource(saved: ExplorerSource | null, databaseIds: readonly string[]): ExplorerSource {
  if (!saved) {
    return "masters";
  }
  const fileId = fileDatabaseId(saved);
  if (fileId !== null && !databaseIds.includes(fileId)) {
    return "masters";
  }
  return saved;
}
