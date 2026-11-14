// SIG-1341: reserved notice slot above the dossier opening cards. The
// repertoire-coverage issue replaces this file; it intentionally renders nothing for now.
import type { PlayerGame } from "@/src/lib/player-types";

export type DossierOpeningsNoticeProps = {
  games: PlayerGame[];
  opponentColor: "white" | "black";
};

export function DossierOpeningsNotice(props: DossierOpeningsNoticeProps) {
  void props;
  return null;
}
