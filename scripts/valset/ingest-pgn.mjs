// SIG-1221: ingest annotated PGN into validation-set items (JSONL).
//
//   node --import ./scripts/test-resolve.mjs scripts/valset/ingest-pgn.mjs \
//        <in.pgn...> --source "Course X" --out valset-data/items.jsonl
//
// Every annotated main-line move becomes one item. "Annotated" means the move
// has a comment, a hand-label tag, or a move NAG (! ? !! ?? !? ?!). Parsing goes
// through the app's own PGN importer, so what ingests here opens in Studio too.
//
// Hand-label tags (inside a {comment}), all optional:
//   [%themes fork,pin]       the author's themes for this move; REPLACES the
//                            words detected in the comment text
//   [%mustmention fork]      themes the facts MUST contain (checked as a hard recall)
//   [%mustnotclaim pin]      themes the facts must NOT report (checked as a hard false positive)
// Unknown theme words are never dropped: they are kept in `unknownTags` and listed
// in the ingest summary.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { importPgn } from "../../src/chess/pgn.ts";
import { pgnGameChunks } from "../../src/chess/pgn-clean.ts";
import { dividePhases, phaseAt } from "../../src/chess/phases.ts";
import { BAD_MOVE_NAGS, GOOD_MOVE_NAGS, RATING_BANDS, ratingBandFor, toJsonl, validateItems } from "./schema.mjs";
import { detectThemes, isMappedTheme, parseThemeTags, themeById } from "./themes.mjs";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MOVE_NAGS = new Set([...BAD_MOVE_NAGS, ...GOOD_MOVE_NAGS, 5]);
const TAG_COMMANDS = /\[%(themes|mustmention|mustnotclaim)\s+([^\]]*)\]/gi;

export function slug(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Move-number-annotated SAN line for the plies played before the item's position. */
export function contextPgnFor(startFen, sans) {
  const parts = startFen.split(" ");
  let color = parts[1] === "b" ? "b" : "w";
  let number = Number(parts[5]) || 1;
  const out = [];
  sans.forEach((san, index) => {
    if (color === "w") {
      out.push(`${number}.`, san);
    } else {
      out.push(index === 0 ? `${number}...` : "", san);
      number += 1;
    }
    color = color === "w" ? "b" : "w";
  });
  const movetext = out.filter(Boolean).join(" ");
  if (startFen === STANDARD_FEN) {
    return movetext;
  }
  return `[SetUp "1"]\n[FEN "${startFen}"]\n\n${movetext}`.trim();
}

/**
 * Turn PGN text into items.
 * @param {string} text
 * @param {{ course: string, file?: string | null }} options
 * @returns {{ items: object[], warnings: string[] }}
 */
export function ingestPgnText(text, options) {
  const course = options.course;
  const file = options.file ?? null;
  const stem = slug(file ? basename(file, extname(file)) : "pgn");
  const warnings = [];
  const items = [];
  // The importer drops unknown [%...] commands; carry ours through as plain words.
  const prepared = text.replace(TAG_COMMANDS, (_match, command, values) => `@@${command.toLowerCase()}:${values}@@`);

  pgnGameChunks(prepared, { keepClocks: true }).forEach((chunk, index) => {
    const gameNo = index + 1;
    const game = importPgn(chunk);
    const where = `${file ?? "pgn"} game ${gameNo}`;
    for (const warning of game.warnings) {
      warnings.push(`${where}: ${warning}`);
    }
    const first = game.tree.children[0];
    if (!first) {
      warnings.push(`${where}: no playable moves, skipped`);
      return;
    }
    const headers = game.headers;
    const startFen = game.tree.startFen;

    // Main line, with the variations that branch off each move.
    const line = [];
    let siblings = game.tree.children;
    let fenBefore = startFen;
    while (siblings.length > 0) {
      const node = siblings[0];
      line.push({ node, siblings, fenBefore });
      fenBefore = node.fen;
      siblings = node.children;
    }
    const fens = [startFen, ...line.map((entry) => entry.node.fen)];
    const division = dividePhases(fens);
    const phaseOverride = ["opening", "middlegame", "endgame"].includes(headers.Phase) ? headers.Phase : null;

    const elo = [Number(headers.WhiteElo), Number(headers.BlackElo)].filter((value) => Number.isFinite(value) && value > 0);
    let ratingBand = elo.length > 0 ? ratingBandFor(elo.reduce((a, b) => a + b, 0) / elo.length) : "unrated";
    if (headers.RatingBand) {
      if (RATING_BANDS.includes(headers.RatingBand)) {
        ratingBand = headers.RatingBand;
      } else {
        warnings.push(`${where}: RatingBand "${headers.RatingBand}" is not one of ${RATING_BANDS.join(", ")}`);
      }
    }
    const chapter = headers.Chapter ?? headers.Event ?? null;

    line.forEach(({ node, siblings: choices, fenBefore: fen }, ply) => {
      const raw = [node.commentBefore, node.comment].filter(Boolean).join(" ");
      const tags = parseThemeTags(raw);
      const nags = node.nags ?? [];
      const hasMoveNag = nags.some((nag) => MOVE_NAGS.has(nag));
      if (!tags.text && tags.themes === null && !hasMoveNag && tags.mustMention.length === 0 && tags.mustNotClaim.length === 0) {
        return;
      }
      const id = `${slug(course)}.${stem}.g${gameNo}.m${ply + 1}`;
      const detected = detectThemes(tags.text);
      const themes = tags.themes ?? detected.themes;
      for (const word of tags.unknown) {
        warnings.push(`${id}: unknown theme tag "${word}" (kept in unknownTags)`);
      }
      const variation = nags.some((nag) => BAD_MOVE_NAGS.includes(nag)) ? choices[1] : undefined;
      items.push({
        id,
        source: { course, chapter, file: file ? basename(file) : null, game: gameNo },
        fen,
        playedMove: { san: node.san, uci: node.uci },
        contextPgn: contextPgnFor(startFen, line.slice(0, ply).map((entry) => entry.node.san)),
        authorText: tags.text,
        authorBestMove: variation ? { san: variation.san, uci: variation.uci } : null,
        nags,
        themes,
        handLabelled: tags.themes !== null,
        textThemes: detected.themes,
        unmappedThemes: themes.filter((theme) => !isMappedTheme(theme)),
        unknownTags: tags.unknown,
        phase: phaseOverride ?? phaseAt(division, ply),
        tactical: themes.some((theme) => themeById(theme)?.group === "tactical"),
        ratingBand,
        mustMention: tags.mustMention,
        mustNotClaim: tags.mustNotClaim,
      });
    });
  });
  const check = validateItems(items);
  if (!check.ok) {
    throw new Error(`ingest produced invalid items:\n${check.errors.join("\n")}`);
  }
  return { items, warnings };
}

export function summarize(items, warnings) {
  const count = (list) => list.reduce((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});
  const lines = [`${items.length} items`];
  lines.push(`themes: ${JSON.stringify(count(items.flatMap((item) => item.themes)))}`);
  const unmapped = count(items.flatMap((item) => item.unmappedThemes));
  if (Object.keys(unmapped).length > 0) lines.push(`unmapped themes (no fact kind): ${JSON.stringify(unmapped)}`);
  const unknown = items.flatMap((item) => item.unknownTags);
  if (unknown.length > 0) lines.push(`unknown theme tags: ${JSON.stringify(count(unknown))}`);
  lines.push(`without any theme: ${items.filter((item) => item.themes.length === 0).length}`);
  lines.push(`phases: ${JSON.stringify(count(items.map((item) => item.phase)))}`);
  for (const warning of warnings) lines.push(`warning: ${warning}`);
  return lines.join("\n");
}

export function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { source: { type: "string" }, out: { type: "string" } },
  });
  if (positionals.length === 0 || !values.source || !values.out) {
    console.error('usage: ingest-pgn.mjs <in.pgn...> --source "Course X" --out valset-data/items.jsonl');
    return 2;
  }
  const items = [];
  const warnings = [];
  for (const file of positionals) {
    const result = ingestPgnText(readFileSync(file, "utf8"), { course: values.source, file });
    items.push(...result.items);
    warnings.push(...result.warnings);
  }
  const check = validateItems(items);
  if (!check.ok) {
    console.error(check.errors.join("\n"));
    return 1;
  }
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, toJsonl(items));
  console.log(`${summarize(items, warnings)}\nwrote ${values.out}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
