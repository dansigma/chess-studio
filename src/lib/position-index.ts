import type { GameTree, TreeNode } from "@/src/chess/tree";
import { positionKey } from "@/src/chess/zobrist";

export type PositionRow = {
  game_id: string;
  seq: number;
  ply: number;
  zkey: string;
  next_uci: string | null;
};

export type StatRow = {
  database_id: string;
  zkey: string;
  next_uci: string;
  games: number;
  white_wins: number;
  draws: number;
  black_wins: number;
};

type Bucket = "white" | "draws" | "black";

export function resultBucket(result: string | null | undefined): Bucket {
  if (result === "1-0") {
    return "white";
  }
  if (result === "0-1") {
    return "black";
  }
  return "draws";
}

export function visitGameTree(
  tree: GameTree,
  visit: (
    event:
      | { type: "position"; fen: string; leaf: boolean }
      | { type: "move"; fenBefore: string; san: string; uci: string; ply: number },
  ) => void,
): void {
  const walk = (fen: string, nodes: TreeNode[], ply: number) => {
    visit({ type: "position", fen, leaf: nodes.length === 0 });
    for (const node of nodes) {
      visit({ type: "move", fenBefore: fen, san: node.san, uci: node.uci, ply: ply + 1 });
      walk(node.fen, node.children, ply + 1);
    }
  };
  walk(tree.startFen, tree.children, 0);
}

export function rowsForTree(tree: GameTree, gameId: string, bucket: Bucket): {
  positions: PositionRow[];
  stats: Map<string, { zkey: string; nextUci: string; bucket: Bucket }>;
} {
  const positions: PositionRow[] = [];
  const stats = new Map<string, { zkey: string; nextUci: string; bucket: Bucket }>();
  const seenMoves = new Set<string>();
  let leafPly = 0;
  visitGameTree(tree, (event) => {
    if (event.type === "position") {
      if (!event.leaf || event.fen === tree.startFen) {
        return;
      }
      leafPly += 1;
      positions.push({
        game_id: gameId,
        seq: positions.length + 1,
        ply: 1_000_000 + leafPly,
        zkey: positionKey(event.fen).toString(),
        next_uci: null,
      });
      return;
    }
    const zkey = positionKey(event.fenBefore).toString();
    positions.push({
      game_id: gameId,
      seq: positions.length + 1,
      ply: event.ply,
      zkey,
      next_uci: event.uci || null,
    });
    const dedupe = `${zkey}|${event.uci}`;
    if (!seenMoves.has(dedupe) && event.uci) {
      seenMoves.add(dedupe);
      stats.set(dedupe, { zkey, nextUci: event.uci, bucket });
    }
  });
  return { positions, stats };
}

export function mergeStatRows(
  databaseId: string,
  contributions: Array<{ zkey: string; nextUci: string; bucket: Bucket }>,
): StatRow[] {
  const totals = new Map<string, StatRow>();
  for (const item of contributions) {
    const key = `${item.zkey}|${item.nextUci}`;
    const row = totals.get(key) ?? {
      database_id: databaseId,
      zkey: item.zkey,
      next_uci: item.nextUci,
      games: 0,
      white_wins: 0,
      draws: 0,
      black_wins: 0,
    };
    row.games += 1;
    if (item.bucket === "white") {
      row.white_wins += 1;
    } else if (item.bucket === "black") {
      row.black_wins += 1;
    } else {
      row.draws += 1;
    }
    totals.set(key, row);
  }
  return [...totals.values()];
}
