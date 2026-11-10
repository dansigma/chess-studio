// Adapter registry. Open to more adapters (Masters registers itself in SIG-1276).
import type { LibrarySourceAdapter, LibrarySourceId } from "./types";

const adapters = new Map<LibrarySourceId, LibrarySourceAdapter>();

export function registerLibrarySource(adapter: LibrarySourceAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function unregisterLibrarySource(id: LibrarySourceId): void {
  adapters.delete(id);
}

export function getLibrarySource(id: LibrarySourceId): LibrarySourceAdapter | undefined {
  return adapters.get(id);
}

export function listLibrarySources(): LibrarySourceAdapter[] {
  return [...adapters.values()];
}

export function clearLibrarySources(): void {
  adapters.clear();
}
