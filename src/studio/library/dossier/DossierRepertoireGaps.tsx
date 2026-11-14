// SIG-1341: reserved gaps slot below the dossier move-by-move tree. The
// repertoire-gaps issue replaces this file; it intentionally renders nothing for now.
import type { PlayerGame } from "@/src/lib/player-types";

export type DossierRepertoireGapsProps = {
  games: PlayerGame[];
  opponentColor: "white" | "black";
};

export function DossierRepertoireGaps(props: DossierRepertoireGapsProps) {
  void props;
  return null;
}
