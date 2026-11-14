// SIG-1341: reserved second-line slot on a dossier opening card. The
// "my numbers" issue replaces this file; it intentionally renders nothing for now.
import type { DossierOpeningRow } from "@/src/lib/prep/dossier-openings";

export type DossierOpeningMineProps = {
  row: DossierOpeningRow;
  opponentColor: "white" | "black";
};

export function DossierOpeningMine(props: DossierOpeningMineProps) {
  void props;
  return null;
}
