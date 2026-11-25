import { Chess } from "chess.js";
import { computePositionFacts, computeThreats, computeThreatsToMove } from "@/src/chess/facts/index";
import { acquire } from "@/src/engine/shared-engine";
import type { EngineBuild, EngineLine } from "@/src/engine/stockfish-client";
import type { AskMasterLevel } from "@/src/lib/ask-master/level";
import { loadLineOpeningCharacter } from "@/src/lib/ask-master/opening-character";
import { buildPositionPack } from "@/src/lib/ask-master/position-pack";
import { DEFAULT_EXPLORER_FILTERS, studioFilterQuery } from "@/src/lib/explorer-filters";
import { isExplorerResponse } from "@/src/lib/explorer-types";
import { loadCatalog } from "@/src/lib/openings-catalog";
import { fetchXdGames, fetchXdMoves } from "@/src/lib/xd-database/explorer";

const SOURCE_TIMEOUT_MS = 4000;
/** Past this, the engine answers with the deepest complete set of lines so far. */
const ENGINE_SETTLE_MS = 3500;
const MIN_PARTIAL_DEPTH = 10;
const DEPTH = 18;
const MULTI_PV = 3;

export type PackPosition = {
  fen: string;
  sanLine: readonly string[];
  lineFens: readonly string[];
  engineBuild: EngineBuild;
  engineThreads: number;
  level: AskMasterLevel;
};

async function withDeadline<T>(parent: AbortSignal, load: (signal: AbortSignal) => Promise<T>) {
  if (parent.aborted) return undefined;

  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, SOURCE_TIMEOUT_MS);
  try {
    const cancelled = new Promise<undefined>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(undefined), { once: true });
    });
    return await Promise.race([cancelled, load(controller.signal)]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  }
}

async function collectEngine(
  { fen, engineBuild, engineThreads }: PackPosition,
  signal: AbortSignal,
  acquireEngine: typeof acquire,
) {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return undefined;
  const expectedLines = Math.min(MULTI_PV, chess.moves().length);
  const lease = acquireEngine("ask", engineBuild);
  let unsubscribe: (() => void) | undefined;
  let abort: (() => void) | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<EngineLine[] | undefined>((resolve, reject) => {
      // Lines from the last complete MultiPV set, used when depth 18 takes too long.
      let partial: EngineLine[] | undefined;
      settle = setTimeout(() => resolve(partial), ENGINE_SETTLE_MS);
      abort = () => resolve(undefined);
      signal.addEventListener("abort", abort, { once: true });
      let started = false;
      unsubscribe = lease.subscribe((info) => {
        if (!started || signal.aborted) return;
        if (info.failed) {
          reject(new Error("Engine unavailable"));
          return;
        }
        if (!info.ready || info.fen !== fen) return;
        const lines = info.lines.filter((line) => line.bound === null && line.pvSan.length &&
          (line.scoreCp != null || line.mate != null));
        if (lines.length === expectedLines && lines.every((line) => line.depth >= MIN_PARTIAL_DEPTH)) {
          partial = lines;
        }
        if (lines.length === expectedLines && (
          lines.every((line) => line.depth >= DEPTH) || (!info.running && lines.every((line) => line.mate != null))
        )) resolve(lines);
      });
      started = true;
      lease.analyze(fen, DEPTH, MULTI_PV, engineThreads);
    });
  } finally {
    clearTimeout(settle);
    if (abort) signal.removeEventListener("abort", abort);
    unsubscribe?.();
    lease.release();
  }
}

async function fetchLichess(fen: string, level: AskMasterLevel, signal: AbortSignal) {
  const filters = studioFilterQuery({ ...DEFAULT_EXPLORER_FILTERS, speeds: ["blitz", "rapid", "classical"] });
  const response = await fetch(`/api/explorer?fen=${encodeURIComponent(fen)}&source=lichess&askMasterLevel=${encodeURIComponent(level)}${filters}`, { signal });
  if (!response.ok) return undefined;
  const data: unknown = await response.json();
  if (isExplorerResponse(data) && data.source === "lichess" && !data.notice) return data;
}

export async function collectPositionPack(
  position: PackPosition,
  signal: AbortSignal,
  acquireEngine = acquire,
) {
  const { fen, sanLine, lineFens, level } = position;
  const [catalogOpening, engineLines, lichess, xd, xdGames] = await Promise.all([
    withDeadline(signal, async (sourceSignal) => {
      const catalog = await loadCatalog();
      sourceSignal.throwIfAborted();
      return loadLineOpeningCharacter(lineFens, catalog);
    }),
    withDeadline(signal, (sourceSignal) => collectEngine(position, sourceSignal, acquireEngine)),
    withDeadline(signal, (sourceSignal) => fetchLichess(fen, level, sourceSignal)),
    withDeadline(signal, (sourceSignal) => fetchXdMoves(fen, sourceSignal)),
    withDeadline(signal, (sourceSignal) => fetchXdGames(fen, {}, sourceSignal)),
  ]);
  signal.throwIfAborted();
  return buildPositionPack({
    fen, sanLine, level, startFen: lineFens[0], opening: catalogOpening?.opening ?? xd?.opening ?? lichess?.opening,
    character: catalogOpening?.character,
    facts: computePositionFacts(fen),
    threats: [computeThreatsToMove(fen), computeThreats(fen)],
    engineLines, lichess, xd, xdGames,
  });
}
