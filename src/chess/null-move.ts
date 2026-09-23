export const NULL_MOVE_SAN = "--";
export const NULL_MOVE_UCI = "0000";

export function isNullMoveToken(token: string): boolean {
  const value = token.trim();
  return value === "--" || value === "Z0" || value === NULL_MOVE_UCI;
}

export function applyNullMoveFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  const board = parts[0];
  if (!board) {
    throw new Error("Invalid FEN");
  }
  const turn = parts[1] === "b" ? "b" : "w";
  const castle = parts[2] && parts[2] !== "-" ? parts[2] : "-";
  const half = Number(parts[4] ?? "0");
  const full = Number(parts[5] ?? "1");
  const nextTurn = turn === "w" ? "b" : "w";
  const nextHalf = Number.isFinite(half) ? half + 1 : 1;
  const nextFull = turn === "b" ? (Number.isFinite(full) ? full + 1 : 2) : Number.isFinite(full) ? full : 1;
  return `${board} ${nextTurn} ${castle} - ${nextHalf} ${nextFull}`;
}
