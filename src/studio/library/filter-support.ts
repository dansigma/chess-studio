// SIG-1280: pure mapping from source capabilities to per-filter "disabled" and "limited" info.
import type { LibrarySourceCapabilities, LibrarySupport } from "@/src/lib/library/types";

/** Minimal source shape needed to reason about capabilities. */
export type SupportSource = { label: string; capabilities: LibrarySourceCapabilities };

export type AdvancedFilterField = "opponent" | "color" | "result" | "annotations" | "position" | "player" | "elo" | "eco" | "period";

export const FIELD_CAPABILITY: Record<AdvancedFilterField, keyof LibrarySourceCapabilities> = {
  opponent: "textSearch",
  color: "color",
  result: "result",
  annotations: "annotations",
  position: "position",
  player: "player",
  elo: "eloRange",
  eco: "eco",
  period: "date",
};

/** Labels of the sources that do not apply `key` over their whole data set ("partial" or "none"). */
export function limitedSourceLabels(key: keyof LibrarySourceCapabilities, selected: SupportSource[]): string[] {
  return selected.filter((source) => (source.capabilities[key] as LibrarySupport) !== "full").map((s) => s.label);
}

export type FieldSupport = {
  /** True when no selected source supports the field at all. */
  disabled: boolean;
  /** Sources applying the field only to the games they returned. */
  partial: string[];
  /** Sources that ignore the field. */
  none: string[];
};

export function getFieldSupport(field: AdvancedFilterField, selected: SupportSource[]): FieldSupport {
  const key = FIELD_CAPABILITY[field];
  const labelsFor = (level: LibrarySupport) =>
    selected.filter((source) => (source.capabilities[key] as LibrarySupport) === level).map((s) => s.label);
  const none = labelsFor("none");
  return {
    disabled: selected.length > 0 && none.length === selected.length,
    partial: labelsFor("partial"),
    none,
  };
}
