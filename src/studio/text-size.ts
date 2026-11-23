// SIG-1461: text size for the notation and panel lists (dock + mobile panel
// area). Local-only, like notationDensity.
export type TextSize = "small" | "default" | "large";

export const TEXT_SIZE_IDS = ["small", "default", "large"] as const;

export function isTextSize(value: unknown): value is TextSize {
  return value === "small" || value === "default" || value === "large";
}

/** Value for the `data-text-size` attribute; omitted for the default size. */
export function textSizeAttr(size: TextSize): "small" | "large" | undefined {
  return size === "default" ? undefined : size;
}
