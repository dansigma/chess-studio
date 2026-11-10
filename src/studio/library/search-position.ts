import { useStudioStore } from "@/src/store/studio-store";
import { useLibraryStore } from "./library-store";

/** SIG-1281: "Buscar esta posição na Library" — set the position filter and show the Library. */
export function searchPositionInLibrary(fen: string): void {
  useLibraryStore.getState().setPosition({ fen });
  useStudioStore.getState().setWorkspaceView("library");
}
