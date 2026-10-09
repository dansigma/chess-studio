import type { CompiledPuzzle } from "./engine";

// Client-side loader for the compiled puzzle seed. The seed itself lives in
// the server-only `puzzle-data.ts` module; browsers fetch it from
// /api/puzzles so the catalog never ships in a client chunk.
export async function loadPuzzleCatalog(): Promise<CompiledPuzzle[]> {
  const response = await fetch("/api/puzzles", { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`puzzles API ${response.status}`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("puzzles API shape");
  }
  return payload as CompiledPuzzle[];
}
