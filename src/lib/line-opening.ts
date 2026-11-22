import { fenKey } from "../chess/tree";
import type { CatalogEntry } from "./openings-catalog";

type Opening = Pick<CatalogEntry, "eco" | "name">;

const catalogIndexes = new WeakMap<readonly CatalogEntry[], ReadonlyMap<string, CatalogEntry>>();

export function indexCatalogOpenings(catalog: readonly CatalogEntry[]) {
  const cached = catalogIndexes.get(catalog);
  if (cached) return cached;
  const index = new Map<string, CatalogEntry>();
  for (const entry of catalog) {
    const key = fenKey(entry.fen);
    if ((index.get(key)?.uci.length ?? -1) < entry.uci.length) {
      index.set(key, entry);
    }
  }
  catalogIndexes.set(catalog, index);
  return index;
}

export function resolveLineOpening(
  fens: readonly string[],
  index: ReadonlyMap<string, Opening>,
): Opening | null {
  for (let i = fens.length - 1; i >= 0; i -= 1) {
    const opening = index.get(fenKey(fens[i]));
    if (opening) return { eco: opening.eco, name: opening.name };
  }
  return null;
}
