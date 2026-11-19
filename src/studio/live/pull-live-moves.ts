import { importPgn } from "@/src/chess/pgn";
import { splitPgnGames } from "@/src/chess/pgn-games";
import { fetchRoundPgn } from "@/src/lib/live/lichess-broadcast";
import { parseGame } from "@/src/lib/live/parse-game";
import { useStudioStore } from "@/src/store/studio-store";
import { useLiveStore } from "./live-store";
import { mergeLiveMainline } from "./live-tree-merge";

export type PullLiveMovesResult =
  | { status: "updated"; addedMoves: number }
  | { status: "up-to-date" }
  | { status: "diverged" }
  | { status: "error" };

async function resolveLiveGamePgn(
  roundId: string,
  gameId: string,
  signal?: AbortSignal,
): Promise<{ pgn: string; result: string } | null> {
  const live = useLiveStore.getState();
  const inMemory = live.followedRounds.includes(roundId)
    ? live.gamesByRound[roundId]?.[gameId]
    : undefined;
  if (inMemory?.pgn) {
    return { pgn: inMemory.pgn, result: inMemory.result };
  }
  const text = await fetchRoundPgn(roundId, signal);
  if (!text) {
    return null;
  }
  const game = splitPgnGames(text)
    .map((chunk) => parseGame(chunk, roundId))
    .find((parsed) => parsed?.id === gameId);
  if (!game?.pgn) {
    return null;
  }
  return { pgn: game.pgn, result: game.result };
}

/**
 * SIG-1406: pulls the latest mainline moves for a Studio board linked to a live
 * broadcast game, merging them without erasing local analysis variations.
 */
export async function pullLiveMoves(
  boardId: string,
  signal?: AbortSignal,
): Promise<PullLiveMovesResult> {
  const studio = useStudioStore.getState();
  const board = studio.boards.find((b) => b.id === boardId);
  const source = board?.liveSource;
  if (!board || !source) {
    return { status: "error" };
  }

  try {
    const resolved = await resolveLiveGamePgn(source.roundId, source.gameId, signal);
    if (!resolved) {
      return { status: "error" };
    }
    const imported = importPgn(resolved.pgn);
    const latestBoard = useStudioStore.getState().boards.find((b) => b.id === boardId);
    if (!latestBoard) {
      return { status: "error" };
    }
    const merged = mergeLiveMainline(latestBoard.tree, imported.tree, latestBoard.path);
    if (merged.diverged) {
      return { status: "diverged" };
    }
    const nextResult = resolved.result && resolved.result !== latestBoard.headers.Result ? resolved.result : undefined;
    if (merged.addedMoves === 0 && !nextResult) {
      return { status: "up-to-date" };
    }
    useStudioStore.getState().applyLiveMerge(boardId, merged.tree, merged.path, nextResult);
    return { status: "updated", addedMoves: merged.addedMoves };
  } catch {
    return { status: "error" };
  }
}
