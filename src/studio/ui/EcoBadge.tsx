// SIG-1330: ECO code (A00-E99) coloured by opening family, shared by the
// Library table, database summary and player dossier.

export type EcoFamily = "A" | "B" | "C" | "D" | "E";

/** Family letter of an ECO code, or null for a missing/invalid one. */
export function ecoFamily(code: string | null | undefined): EcoFamily | null {
  const first = code?.trim().charAt(0).toUpperCase();
  return first && "ABCDE".includes(first) ? (first as EcoFamily) : null;
}

const FAMILY_CLASS: Record<EcoFamily, string> = {
  A: "text-studio-eco-a",
  B: "text-studio-eco-b",
  C: "text-studio-eco-c",
  D: "text-studio-eco-d",
  E: "text-studio-eco-e",
};

export function EcoBadge({
  code,
  opening,
}: {
  code: string | null | undefined;
  opening?: string | null;
}) {
  const family = ecoFamily(code);
  const base = "inline-block w-[3ch] text-center font-mono tabular-nums";
  return (
    <span
      className={`${base} ${family ? FAMILY_CLASS[family] : "text-studio-faint"}`}
      title={opening || undefined}
      data-eco-family={family ?? "none"}
    >
      {family ? code!.trim().toUpperCase() : "—"}
    </span>
  );
}
