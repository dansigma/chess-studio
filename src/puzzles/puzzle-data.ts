import "server-only";
import { ALL_PUZZLES } from "./catalog-full";
import { compilePuzzle, type CompiledPuzzle } from "./engine";

// Server-only copy of the compiled puzzle seed. Client components must fetch
// it from /api/puzzles instead of importing this module.
export const PUZZLES: CompiledPuzzle[] = ALL_PUZZLES.map(compilePuzzle);
