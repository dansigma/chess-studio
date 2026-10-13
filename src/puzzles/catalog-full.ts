import { PUZZLE_CATALOG } from "./catalog";
import { GENERATED_PUZZLES } from "./catalog-generated";
import type { Puzzle } from "./types";

/**
 * Combined puzzle pool containing the original starter puzzles followed by
 * the curated tiered dataset. Original puzzles remain at the head of the array
 * to ensure historical ID and daily puzzle hash stability.
 */
export const ALL_PUZZLES: Puzzle[] = [...PUZZLE_CATALOG, ...GENERATED_PUZZLES];
