import { getNodeAt, type GameTree, type VariationPoint } from "@/src/chess/tree";

// SIG-1087: sequential opening-book lookup for Game Review. Fetches the
// masters replies of each position in order and stops at the first move that
// leaves the book. The optional signal aborts the in-flight request when a
// review is cancelled; an abort returns the replies collected so far (same
// shape as the isCancelled() early return), never a null sentinel.
export async function fetchBookReplies(
  tree: GameTree,
  points: VariationPoint[],
  isCancelled: () => boolean,
  signal?: AbortSignal,
): Promise<Array<string[] | null>> {
  const replies: Array<string[] | null> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (isCancelled()) {
      return replies;
    }
    try {
      const response = await fetch(
        `/api/explorer?fen=${encodeURIComponent(points[index].fen)}&source=masters`,
        signal ? { signal } : undefined,
      );
      if (!response.ok) {
        replies.push(null);
        break;
      }
      const payload = (await response.json()) as { moves?: Array<{ uci?: string }> };
      const ucis = (payload.moves ?? []).flatMap((move) => (move.uci ? [move.uci] : []));
      replies.push(ucis);
      const node = getNodeAt(tree, points[index + 1].path);
      if (!node || !ucis.includes(node.uci)) {
        break;
      }
    } catch {
      if (signal?.aborted) {
        return replies;
      }
      replies.push(null);
      break;
    }
  }
  return replies;
}
