import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { indexCatalogOpenings, openingAnchorKey } from "../../src/lib/line-opening.ts";
import { loadCatalog } from "../../src/lib/openings-catalog.ts";
import { dedupeHash, openLines } from "../opening-book/build-book.mjs";
import { HashSet64 } from "../opening-book/hashset.mjs";
import { readGames, sanTokens } from "../opening-book/pgn.mjs";
import { profileRejection } from "../opening-book/profiles.mjs";
import { dateNumber } from "./build.mjs";
import { PARAMS, WHITE_SCORE, pawnStructure, percentileProfiles } from "./opening-character-lib.mjs";

function compareHash(a, b) {
  return a.hi - b.hi || a.lo - b.lo;
}

function replay(sans, catalog) {
  const chess = new Chess();
  const anchors = new Map();
  const moves = [];
  const structure = [];
  let queenlessPly = null;
  for (const san of sans) {
    let move;
    try {
      move = chess.move(san);
    } catch {
      return null;
    }
    moves.push(move.lan);
    const ply = moves.length;
    const key = openingAnchorKey(move.after);
    if (catalog.has(key) && !anchors.has(key)) anchors.set(key, ply);
    const board = key.slice(0, key.indexOf(" "));
    if (ply <= PARAMS.endgamePly && queenlessPly === null && !/[Qq]/.test(board)) queenlessPly = ply;
    if (ply >= PARAMS.structureStart && ply <= PARAMS.structureEnd && ply % PARAMS.structureStep === 0) {
      structure.push(pawnStructure(board));
    }
  }
  return { anchors, moves, structure, queenlessPly };
}

function rejection(headers) {
  return profileRejection("masters", headers, PARAMS)
    ?? (!Object.hasOwn(WHITE_SCORE, headers.Result) ? "result" : null)
    ?? (dateNumber(headers.Date) < PARAMS.minYear * 10000 ? "year" : null);
}

async function buildProfiles(inputs, catalog) {
  const samples = new Map();
  const seen = new HashSet64();
  for (const input of inputs) {
    for await (const { headers, movetext, rejected } of readGames(openLines(input), rejection)) {
      if (rejected) continue;
      const sans = sanTokens(movetext);
      if (sans.length === 0) continue;
      const [hi, lo] = dedupeHash(headers, sans.slice(0, PARAMS.dedupePlies));
      if (!seen.add(hi, lo)) continue;
      const game = replay(sans, catalog);
      if (!game) continue;
      const { anchors, ...observations } = game;
      // Keep the smallest hashes per anchor, equivalent to sorting by hash
      // and taking the first 200 without storing the full population.
      for (const [key, anchorPly] of anchors) {
        const sample = samples.get(key) ?? [];
        const entry = { ...observations, anchorPly, hi, lo, result: headers.Result };
        if (sample.length === PARAMS.maxSample && compareHash(entry, sample.at(-1)) >= 0) continue;
        sample.push(entry);
        sample.sort(compareHash);
        if (sample.length > PARAMS.maxSample) sample.pop();
        samples.set(key, sample);
      }
    }
  }
  return percentileProfiles(samples);
}

export async function run(argv) {
  const outAt = argv.indexOf("--out");
  const inputs = argv.slice(0, outAt);
  const out = argv[outAt + 1];
  if (outAt < 1 || outAt !== argv.length - 2 || !out || out.startsWith("--") || inputs.some((input) => input.startsWith("--"))) {
    throw new Error("usage: node --import ./scripts/test-resolve.mjs scripts/xd-database/opening-character.mjs source.pgn [more.pgn ...] --out FILE");
  }
  const catalog = indexCatalogOpenings(await loadCatalog(), true);
  const profiles = await buildProfiles(inputs, catalog);
  await writeFile(out, JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), params: PARAMS, profiles }) + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
