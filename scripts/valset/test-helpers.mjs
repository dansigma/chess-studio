// SIG-1221: shared setup for the valset tests: the synthetic fixture, ingested and
// joined with its precomputed engine ground truth (no Stockfish needed).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addGroundTruthAll, loadCache } from "./ground-truth.mjs";
import { ingestPgnText } from "./ingest-pgn.mjs";

export const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_PGN = join(here, "fixtures", "synthetic.pgn");
export const FIXTURE_CACHE = join(here, "fixtures", "engine-cache.json");
export const FIXTURE_DEPTH = 14;
export const FIXTURE_COURSE = "Synthetic fixture";

export function fixtureItems() {
  return ingestPgnText(readFileSync(FIXTURE_PGN, "utf8"), { course: FIXTURE_COURSE, file: FIXTURE_PGN });
}

export async function fixtureItemsWithTruth() {
  const { items } = fixtureItems();
  const source = {
    cache: loadCache(FIXTURE_CACHE),
    getEngine: async () => {
      throw new Error("the fixture must be fully cached; no engine is available in CI");
    },
  };
  return addGroundTruthAll(items, source, { depth: FIXTURE_DEPTH, multipv: 3, thresholdCp: 50 });
}
