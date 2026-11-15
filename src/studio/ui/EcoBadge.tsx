// SIG-1330: ECO code (A00-E99) shared by the Library table, database summary
// and player dossier. The badge is deliberately neutral (theme greys) so the
// accent blue stays reserved for interactive state.

export type EcoFamily = "A" | "B" | "C" | "D" | "E";

/** Family letter of an ECO code, or null for a missing/invalid one. */
export function ecoFamily(code: string | null | undefined): EcoFamily | null {
  const first = code?.trim().charAt(0).toUpperCase();
  return first && "ABCDE".includes(first) ? (first as EcoFamily) : null;
}

export function EcoBadge({
  code,
  opening,
}: {
  code: string | null | undefined;
  opening?: string | null;
}) {
  const family = ecoFamily(code);
  const base =
    "inline-block rounded border border-studio-border bg-studio-hover-subtle px-1 text-center font-mono text-caption tabular-nums";
  return (
    <span
      className={`${base} ${family ? "text-studio-muted" : "text-studio-faint"}`}
      title={opening || undefined}
      data-eco-family={family ?? "none"}
    >
      {family ? code!.trim().toUpperCase() : "—"}
    </span>
  );
}
