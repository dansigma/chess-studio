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
  if (key === null) return { opening: null, character: null };
  const { eco, name } = index.get(key)!;
  const opening = { eco, name };
  const character = await import("../../data/opening-character.json", { with: { type: "json" } })
    .then(({ default: data }) => {
      const profiles: Record<string, OpeningCharacter | undefined> = data.profiles;
      return data.version === 1 ? profiles[key] ?? null : null;
    })
    .catch(() => null);
  return { opening, character };
}
