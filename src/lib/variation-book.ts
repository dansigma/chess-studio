import { buildVariationBook, type VariationBookOptions, type VariationBookResult } from "@/src/chess/variation-book";
import { loadCountsBook } from "./opening-book-counts.ts";

export async function loadVariationBook(options: VariationBookOptions): Promise<VariationBookResult | { unavailable: true }> {
  const counts = await loadCountsBook();
  return counts ? buildVariationBook(counts, options) : { unavailable: true };
}
