export type NotationDensity = "normal" | "compact";

export const NOTATION_DENSITY_IDS = ["normal", "compact"] as const;

export const NOTATION_DENSITIES: Record<NotationDensity, { label: string }> = {
  normal: { label: "Normal" },
  compact: { label: "Compact" },
};

export function isNotationDensity(value: unknown): value is NotationDensity {
  return value === "normal" || value === "compact";
}
