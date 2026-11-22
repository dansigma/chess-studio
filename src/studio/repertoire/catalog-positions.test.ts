import assert from "node:assert/strict";
import { test } from "node:test";
import { Chess } from "chess.js";
import lines from "@/src/data/openings-catalog.json" with { type: "json" };
import { buildCatalogPositionIndex, catalogPositionIndex, replayCatalogPath } from "./catalog-positions";
import { lineName } from "./group-search-results";

const reti = ["g1f3", "d7d5", "d2d4"];
const queensPawn = ["d2d4", "d7d5", "g1f3"];
const ending = { eco: "D02", name: "Queen's Pawn Game", uci: queensPawn };
const continuation = { eco: "A06", name: "Réti Opening", uci: [...reti, "g8f6"] };
const laterEnding = { ...ending, name: "Later ending", uci: [...queensPawn, "g8f6", "f3g1", "f6g8", "g1f3"] };
const earlierEnding = { ...continuation, name: "Earlier ending", uci: reti.slice(0, 1) };

test("indexes transpositions and records each line's matching ply", () => {
  const catalog = [continuation, ending, laterEnding];
  const index = catalogPositionIndex(catalog);
  const key = replayCatalogPath(reti).keys.at(-1)!;
  assert.equal(key, replayCatalogPath(queensPawn).keys.at(-1));
  assert.deepEqual(index.matches.get(key), [
    { line: continuation, ply: 3 },
    { line: ending, ply: 3 },
    { line: laterEnding, ply: 7 },
  ]);
  assert.equal(catalogPositionIndex(catalog), index);
});

test("names the deepest ending on the played path and prefers the shortest transposed ending", () => {
  const index = buildCatalogPositionIndex([earlierEnding, laterEnding, ending, continuation]);
  assert.equal(index.deepestEnding([]), undefined);
  assert.equal(index.deepestEnding(replayCatalogPath(reti.slice(0, 2)).keys), earlierEnding);
  const offCatalog = [...reti, "c7c5"];
  const current = index.deepestEnding(replayCatalogPath(offCatalog).keys);
  assert.equal(current, ending);
  assert.equal(lineName(current!, "en"), "Queen's Pawn Game");
  assert.equal(index.deepestEnding(replayCatalogPath(continuation.uci).keys), continuation);
});

test("uses the same position keys and SAN as normal play for special moves", () => {
  const samples = [
    "1. e4 a6 2. e5 d5 3. exd6",
    "1. Nf3 Nc6 2. d4 a6 3. Nbd2",
    "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O",
    "1. a4 h5 2. a5 h4 3. a6 h3 4. axb7 hxg2 5. bxa8=N",
  ];
  for (const pgn of samples) {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history({ verbose: true });
    const line = { ...ending, uci: moves.map((move) => move.lan) };
    const index = buildCatalogPositionIndex([line]);
    assert.deepEqual([...index.matches.keys()], replayCatalogPath(line.uci).keys);
    assert.deepEqual(index.notation.get(line), moves.map((move) => move.san));
  }
});

test("builds the real catalog position index quickly", (context) => {
  // CPU time keeps the budget independent of other test workers.
  const cpuStart = process.threadCpuUsage?.();
  const start = performance.now();
  const index = buildCatalogPositionIndex(lines);
  const elapsed = performance.now() - start;
  const cpu = cpuStart && process.threadCpuUsage(cpuStart);
  const cpuMs = cpu && (cpu.user + cpu.system) / 1000;
  const cpuTime = cpuMs === undefined ? "" : ` (${cpuMs.toFixed(1)} ms CPU)`;
  context.diagnostic(`Indexed ${lines.length} lines in ${elapsed.toFixed(1)} ms wall time${cpuTime}`);
  const key = replayCatalogPath(reti).keys.at(-1)!;
  assert.ok(index.matches.get(key)?.length);
  assert.ok((cpuMs ?? elapsed) < 500, "Index exceeded the 500 ms budget");
});

test("chess.js still exposes the private methods the fast index path uses", () => {
  // If this fails after a chess.js upgrade, the index silently falls back to
  // the public API (correct but ~4x slower): update catalogMove in catalog-positions.ts.
  const chess = new Chess() as unknown as Record<string, unknown>;
  for (const method of ["_moves", "_moveToSan", "_makeMove"]) {
    assert.equal(typeof chess[method], "function", `chess.js ${method} is missing`);
  }
});
