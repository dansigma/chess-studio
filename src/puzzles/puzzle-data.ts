import "server-only";
import { PUZZLE_CATALOG } from "./catalog";
import { compilePuzzle, type CompiledPuzzle } from "./engine";

// Server-only copy of the compiled puzzle seed. Client components must fetch
// it from /api/puzzles instead of importing this module.
export const PUZZLES: CompiledPuzzle[] = PUZZLE_CATALOG.map(compilePuzzle);
