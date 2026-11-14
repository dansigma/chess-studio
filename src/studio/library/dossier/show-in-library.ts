import { listLibrarySources } from "@/src/lib/library/sources";
import type { PlayerColorFilter, PlayerHit } from "@/src/lib/player-types";
import { useLibraryStore } from "../library-store";

/** A player whose games live in the user's own PGN files, so the Games tab can list them. */
export function isLocalPlayer(player: PlayerHit): boolean {
  return player.source === "studio" && player.inDatabases === true;
}

/**
 * Opens the Library's Games tab filtered by a local player (the pre-dossier
 * behavior of clicking one). Kept as a dossier action so the full table, with
 * all its filters and sorting, stays one click away.
 */
export function showPlayerInLibrary(player: PlayerHit, color: PlayerColorFilter): void {
  const library = useLibraryStore.getState();
  const available = listLibrarySources().map((source) => source.id);
  // The player's games live in the imported PGN databases (`file:*`).
  const files = available.filter((id) => id.startsWith("file:"));
  library.resetFilters();
  if (files.length > 0) {
    library.setSources(files);
  }
  library.setPlayer(player.username);
  library.setPlayerColor(color === "all" ? "both" : color);
  library.selectGame(null);
  library.setMode("games");
}
