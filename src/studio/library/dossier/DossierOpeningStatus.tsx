// SIG-1341: reserved second-line slot on a dossier opening card. The status
// issue replaces this file; it intentionally renders nothing for now.
import type { DossierOpeningRow } from "@/src/lib/prep/dossier-openings";

export type DossierOpeningStatusProps = {
  row: DossierOpeningRow;
  opponentColor: "white" | "black";
};

export function DossierOpeningStatus(props: DossierOpeningStatusProps) {
  void props;
  return null;
}
