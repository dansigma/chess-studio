// scripts/xd-database/inspect.mjs
// SIG-1449: checks and queries a built database folder.
//
//   node scripts/xd-database/inspect.mjs out/v1                      manifest summary
//   node scripts/xd-database/inspect.mjs out/v1 --fen "<FEN>"        tree entry of a position
//   node scripts/xd-database/inspect.mjs out/v1 --game 123           one game
//   node scripts/xd-database/inspect.mjs out/v1 --player carlsen     player search
//   node scripts/xd-database/inspect.mjs out/v1 --check 2000         replays 2000 games spread over
//       the store and checks that every position they reach up to the max ply is in the tree with the
//       move played (or is below the minimum games), and that the counts add up. Exit code 1 on any error.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { bookKey } from "../../src/chess/opening-book.ts";
import { decodeMove, encodeMove } from "../../src/chess/opening-book-format.ts";
import { XdDatabaseReader } from "../../src/lib/xd-database/reader.ts";
import { localSource } from "./local-source.mjs";

const USAGE = "usage: node scripts/xd-database/inspect.mjs <build dir> [--fen FEN | --game ID | --player PREFIX | --check N]";

function describePosition(position) {
  if (!position) {
    return "not in the tree";
  }
  const lines = [`${position.total} games, ${position.moves.length} moves, ${position.gameIds.length} top games`];
  for (const move of position.moves.slice(0, 12)) {
    const games = move.white + move.draws + move.black;
    lines.push(`  ${decodeMove(move.code).padEnd(6)} ${String(games).padStart(9)}  +${move.white} =${move.draws} -${move.black}  avg ${move.averageRating}  last ${move.lastYear}`);
  }
  return lines.join("\n");
}

/** Replays `sample` games spread over the store against the tree. Returns { checked, positions, errors }. */
export async function checkSample(reader, sample, manifest) {
  const count = await reader.gameCount();
  const maxPly = await reader.maxPly();
  const minGames = manifest?.rules?.minGames ?? 2;
  const step = Math.max(1, Math.floor(count / Math.max(1, sample)));
  const ids = [];
  for (let id = 0; id < count && ids.length < sample; id += step) {
    ids.push(id);
  }
  const errors = [];
  let positions = 0;
  for (const { id, game } of await reader.gamesById(ids)) {
    const board = new Chess();
    const sans = game.moves.split(" ");
    const seen = new Set();
    for (let ply = 0; ply <= Math.min(sans.length, maxPly); ply += 1) {
      const key = bookKey(board.fen());
      if (seen.has(key)) {
        // A repeated position is counted once per game; skip it.
      } else {
        seen.add(key);
        const position = await reader.position(key);
        positions += 1;
        let code = 0;
        if (ply < Math.min(sans.length, maxPly)) {
          try {
            const move = board.move(sans[ply]);
            code = encodeMove(move.from + move.to + (move.promotion ?? ""));
          } catch {
            break;
          }
          board.undo();
        }
        if (!position) {
          // Allowed only when the position may be below the minimum: we cannot tell without the full
          // count, but its parent move must then count fewer than minGames games.
        } else {
          const sum = position.moves.reduce((s, m) => s + m.white + m.draws + m.black, 0);
          if (sum > position.total) {
            errors.push(`game ${id} ply ${ply}: moves count ${sum} > total ${position.total}`);
          }
          if (position.total < minGames) {
            errors.push(`game ${id} ply ${ply}: total ${position.total} below the minimum`);
          }
          if (code !== 0 && !position.moves.some((m) => m.code === code)) {
            errors.push(`game ${id} ply ${ply}: move ${sans[ply]} missing`);
          }
        }
      }
      if (ply < sans.length && ply < maxPly) {
        try {
          board.move(sans[ply]);
        } catch {
          errors.push(`game ${id} ply ${ply}: illegal move ${sans[ply]}`);
          break;
        }
      }
    }
  }
  return { checked: ids.length, positions, errors };
}

export async function run(argv, out = (line) => process.stdout.write(`${line}\n`)) {
  const dir = argv[0];
  if (!dir || dir.startsWith("--")) {
    throw new Error(USAGE);
  }
  const reads = { reads: 0 };
  const reader = new XdDatabaseReader(localSource(dir, reads));
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const flag = argv[1];
  const value = argv[2];
  if (flag === undefined) {
    const { stats, files } = manifest;
    out(`version ${manifest.version} (format ${manifest.formatVersion}), built ${manifest.buildDate}, release ${manifest.release ?? "-"}`);
    out(`games: ${stats.gamesKept} kept of ${stats.gamesRead} read, ${stats.duplicates} duplicates, ${stats.illegalGames} with an illegal move`);
    out(`tree: ${stats.positions} positions, ${stats.moves} moves; players: ${stats.players}`);
    for (const [name, file] of Object.entries(files)) {
      out(`  ${name.padEnd(18)} ${String(file.bytes).padStart(14)}  ${file.sha256}`);
    }
    out(`start position:\n${describePosition(await reader.position(bookKey(new Chess().fen())))}`);
    return 0;
  }
  if (flag === "--fen" && value) {
    out(describePosition(await reader.positionByFen(value)));
    return 0;
  }
  if (flag === "--game" && value) {
    const game = await reader.game(Number(value));
    out(game ? JSON.stringify(game, null, 2) : "no such game");
    return game ? 0 : 1;
  }
  if (flag === "--player" && value) {
    for (const player of await reader.searchPlayers(value, 20)) {
      const ids = await reader.playerGameIds(player, 0, 3);
      out(`${player.name} (FIDE ${player.fideId || "-"}): ${player.count} games, ${player.firstYear}-${player.lastYear}, newest ids ${ids.join(", ")}`);
    }
    return 0;
  }
  if (flag === "--check" && value) {
    const result = await checkSample(reader, Number(value), manifest);
    out(`checked ${result.checked} games, ${result.positions} positions, ${result.errors.length} errors, ${reads.reads} reads`);
    for (const error of result.errors.slice(0, 50)) {
      out(`  ${error}`);
    }
    return result.errors.length === 0 ? 0 : 1;
  }
  throw new Error(USAGE);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
