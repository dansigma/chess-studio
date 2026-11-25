import type { BroadcastStandingRow } from "./types";

export function findStandingRow(
  rows: readonly BroadcastStandingRow[],
  { fideId, name }: { fideId?: number | null; name: string },
): BroadcastStandingRow | undefined {
  const byId = fideId == null ? undefined : rows.find((row) => row.fideId === fideId);
  return byId ?? rows.find((row) => row.name === name);
}
