export type NotationDensity = "normal" | "compact" | "table";

// SIG-1193: "table" lays the mainline out in number · White · Black columns.
export const NOTATION_DENSITY_IDS = ["normal", "compact", "table"] as const;

export const NOTATION_DENSITIES: Record<NotationDensity, { label: string }> = {
  normal: { label: "Normal" },
  compact: { label: "Compact" },
  table: { label: "Table" },
};

export function isNotationDensity(value: unknown): value is NotationDensity {
  return value === "normal" || value === "compact" || value === "table";
}
