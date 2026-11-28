import { fenKey } from "../chess/tree.ts";
import type { CatalogEntry } from "./openings-catalog";

type Opening = Pick<CatalogEntry, "eco" | "name">;

const catalogIndexes = new WeakMap<readonly CatalogEntry[], ReadonlyMap<string, CatalogEntry>>();

const anchorIndexes = new WeakMap<readonly CatalogEntry[], ReadonlyMap<string, CatalogEntry>>();

export function openingAnchorKey(fen: string): string {
  const [board, turn, castling] = fen.trim().split(/\s+/, 3);
  return `${board} ${turn} ${castling}`;
}

export function indexCatalogOpenings(catalog: readonly CatalogEntry[], ignoreEnPassant = false) {
  const indexes = ignoreEnPassant ? anchorIndexes : catalogIndexes;
  const cached = indexes.get(catalog);
  if (cached) return cached;
  const index = new Map<string, CatalogEntry>();
  for (const entry of catalog) {
    const key = ignoreEnPassant ? openingAnchorKey(entry.fen) : fenKey(entry.fen);
    if ((index.get(key)?.uci.length ?? -1) < entry.uci.length) {
      index.set(key, entry);
    }
  }
  indexes.set(catalog, index);
  return index;
}

export function resolveLineOpening(
  fens: readonly string[],
  index: ReadonlyMap<string, Opening>,
): Opening | null {
  const key = resolveLineOpeningKey(fens, index);
  const opening = key === null ? undefined : index.get(key);
  return opening ? { eco: opening.eco, name: opening.name } : null;
}

export function resolveLineOpeningKey(
  fens: readonly string[],
  index: ReadonlyMap<string, Opening>,
  ignoreEnPassant = false,
): string | null {
  const keyOf = ignoreEnPassant ? openingAnchorKey : fenKey;
  for (let i = fens.length - 1; i >= 0; i -= 1) {
    const key = keyOf(fens[i]);
    if (index.has(key)) return key;
  }
  return null;
}
