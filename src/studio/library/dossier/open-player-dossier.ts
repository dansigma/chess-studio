// SIG-1347: the Studio's shortcut into the Library player dossier. Sets the
// Players mode, selects the player, then switches the center view last so the
// view hook writes one URL entry carrying both `mode=players` and `player=...`.
import type { PlayerHit } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "../library-store";
import { useDossierStore } from "./dossier-store";

/** Opens the Library's Players tab with this player's dossier selected. */
export function openPlayerDossier(player: PlayerHit): void {
  useDossierStore.getState().openPlayer(player);
  useLibraryStore.getState().setMode("players");
  useStudioStore.getState().setWorkspaceView("library");
}

/** Opens the Library's Players tab without changing the selected dossier. */
export function openPlayersLibrary(): void {
  useLibraryStore.getState().setMode("players");
  useStudioStore.getState().setWorkspaceView("library");
}
