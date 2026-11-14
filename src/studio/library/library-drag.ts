// SIG-1343: drag types shared by the Library rail and its import drop zone.
// PGN file rows carry a private type so a folder can tell them apart from the
// files the user drags in from the computer (`Files`).
import type { DragEvent } from "react";

/** Private drag type for a PGN file row dragged onto a folder in the rail. */
export const LIBRARY_DATABASE_MIME = "application/x-chess-studio-database";

/** How long the pointer must rest on a collapsed folder before it opens. */
export const FOLDER_EXPAND_DELAY_MS = 1000;

function dragTypes(event: DragEvent): string[] {
  return Array.from(event.dataTransfer?.types ?? []);
}

/** A drop of one or more files dragged from the computer. */
export function hasFileDrag(event: DragEvent): boolean {
  return dragTypes(event).includes("Files");
}

/** A drop of a PGN file row dragged inside the rail. */
export function hasDatabaseDrag(event: DragEvent): boolean {
  return dragTypes(event).includes(LIBRARY_DATABASE_MIME);
}

/** The database id carried by a rail drag; null when the drag is not one of ours. */
export function draggedDatabaseId(event: DragEvent): string | null {
  return event.dataTransfer?.getData(LIBRARY_DATABASE_MIME) || null;
}
