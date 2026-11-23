import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { bookKey } from "../../src/chess/opening-book.ts";
import { decodeMove } from "../../src/chess/opening-book-format.ts";
import { XdDatabaseReader } from "../../src/lib/xd-database/reader.ts";
import { localSource } from "./local-source.mjs";

const USAGE = "usage: node scripts/xd-database/compare.mjs <old v-dir> <new v-dir> [--sample N] [--json]";
const DEFAULT_SAMPLE = 200;
const OPENING_PLIES = 4;
const OPENING_BRANCHES = 3;

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
}

function diff(oldValue, newValue) {
  const old = Number.isFinite(oldValue) ? oldValue : null;
  const next = Number.isFinite(newValue) ? newValue : null;
  return { old, new: next, delta: old === null || next === null ? null : next - old };
}

function sampleIds(count, size) {
  // Floyd's algorithm draws unique IDs without scanning or shuffling the store.
  const ids = new Set();
  let seed = 0x1452;
  for (let id = count - Math.min(count, size); id < count; id += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const candidate = Math.floor((seed / 2 ** 32) * (id + 1));
    ids.add(ids.has(candidate) ? id : candidate);
  }
  return [...ids].sort((a, b) => a - b);
}

async function comparePositions(oldReader, newReader, ids) {
  const oldPositions = new Map();
  const errors = [];
  let positionsChecked = 0;

  async function check(board) {
    const fen = board.fen();
    const key = bookKey(fen);
    if (oldPositions.has(key)) {
      return oldPositions.get(key);
    }
    const oldPosition = await oldReader.position(key);
    oldPositions.set(key, oldPosition);
    if (oldPosition) {
      positionsChecked += 1;
      const newPosition = await newReader.position(key);
      if (!newPosition) {
        errors.push(`Position missing in new tree (old total ${oldPosition.total}): ${fen}`);
      } else if (newPosition.total < oldPosition.total) {
        errors.push(`Position total decreased (${oldPosition.total} to ${newPosition.total}): ${fen}`);
      }
    }
    return oldPosition;
  }

  // Tree moves are ordered by game count. Follow the first three from each
  // position through four plies, independently of the random game sample.
  async function followOpening(board, ply) {
    const position = await check(board);
    if (!position || ply === OPENING_PLIES) {
      return;
    }
    for (const move of position.moves.slice(0, OPENING_BRANCHES)) {
      board.move(decodeMove(move.code));
      await followOpening(board, ply + 1);
      board.undo();
    }
  }

  await followOpening(new Chess(), 0);

  const maxPly = await oldReader.maxPly();
  // Bound the number of game blocks held by each reader call.
  for (let offset = 0; offset < ids.length; offset += 200) {
    for (const { game } of await oldReader.gamesById(ids.slice(offset, offset + 200))) {
      const board = new Chess();
      for (const san of game.moves.split(" ", maxPly)) {
        try {
          board.move(san);
        } catch {
          // The builder indexes only legal positions before an invalid SAN.
          break;
        }
        await check(board);
      }
    }
  }
  return { positionsChecked, errors };
}

/** Compare a build against its predecessor. Missing manifest stats are shown as null. */
export async function compareVersions(oldDir, newDir, { sample = DEFAULT_SAMPLE } = {}) {
  if (!Number.isSafeInteger(sample) || sample < 0) {
    throw new Error("--sample must be a nonnegative integer");
  }
  const oldManifest = readManifest(oldDir);
  const newManifest = readManifest(newDir);
  const oldReader = new XdDatabaseReader(localSource(oldDir));
  const newReader = new XdDatabaseReader(localSource(newDir));
  const [oldCount, newCount] = await Promise.all([oldReader.gameCount(), newReader.gameCount()]);
  const stats = Object.fromEntries(["gamesKept", "positions", "moves", "players"].map((key) => [
    key,
    diff(oldManifest.stats?.[key], newManifest.stats?.[key]),
  ]));
  const files = Object.fromEntries(
    [...new Set([...Object.keys(oldManifest.files ?? {}), ...Object.keys(newManifest.files ?? {})])]
      .sort()
      .map((name) => [name, diff(oldManifest.files?.[name]?.bytes, newManifest.files?.[name]?.bytes)]),
  );

  const ids = sampleIds(oldCount, sample);
  const { positionsChecked, errors } = await comparePositions(oldReader, newReader, ids);
  const kept = diff(stats.gamesKept.old ?? oldCount, stats.gamesKept.new ?? newCount);
  if (kept.delta < 0) {
    errors.unshift(`Games kept decreased (${kept.old} to ${kept.new})`);
  }
  return {
    oldVersion: oldManifest.version ?? null,
    newVersion: newManifest.version ?? null,
    stats,
    files,
    sampledGames: ids.length,
    positionsChecked,
    errors,
  };
}

function printComparison(result) {
  const value = (number) => number ?? "-";
  const row = (name, old, next, delta) =>
    console.log([name.padEnd(28), ...[old, next, delta].map((cell) => String(cell).padStart(14))].join(" "));
  row("", `v${value(result.oldVersion)}`, `v${value(result.newVersion)}`, "Delta");
  for (const [name, change] of [...Object.entries(result.stats), ...Object.entries(result.files)]) {
    const delta = change.delta > 0 ? `+${change.delta}` : value(change.delta);
    row(name, value(change.old), value(change.new), delta);
  }
  console.log(`Sampled ${result.sampledGames} old games, checked ${result.positionsChecked} old tree positions, ${result.errors.length} errors`);
  for (const error of result.errors) {
    console.log(error);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { positionals, values } = parseArgs({
      options: { sample: { type: "string" }, json: { type: "boolean" } },
      allowPositionals: true,
    });
    if (positionals.length !== 2) {
      throw new Error(USAGE);
    }
    if (values.sample !== undefined && !/^\d+$/.test(values.sample)) {
      throw new Error("--sample must be a nonnegative integer");
    }
    const result = await compareVersions(...positionals, {
      sample: values.sample === undefined ? DEFAULT_SAMPLE : Number(values.sample),
    });
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printComparison(result);
    }
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
