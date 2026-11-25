import { indexCatalogOpenings, resolveLineOpeningKey } from "../line-opening";
import type { CatalogEntry } from "../openings-catalog";

export type OpeningCharacter = {
  n: number;
  decisive: number;
  closed: number | null;
  breadth: number;
  endgame: number | null;
};

export async function loadLineOpeningCharacter(fens: readonly string[], catalog: readonly CatalogEntry[]) {
  const index = indexCatalogOpenings(catalog, true);
  const key = resolveLineOpeningKey(fens, index, true);
  const entry = key === null ? undefined : index.get(key);
  if (key === null || !entry) return { opening: null, character: null };
  const opening = { eco: entry.eco, name: entry.name };
  const character = await import("../../data/opening-character.json", { with: { type: "json" } })
    .then(({ default: data }) => {
      const profiles: Record<string, OpeningCharacter | undefined> = data.profiles;
      return data.version === 1 ? profiles[key] ?? null : null;
    })
    .catch(() => null);
  return { opening, character };
}
