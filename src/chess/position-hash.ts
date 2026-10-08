/**
 * Shared FNV-1a 64-bit position hash.
 *
 * Used by `zobrist.ts` (position keys) and `scripts/build-opening-index.mjs`
 * (opening index rows), so both agree on the same value for the same FEN.
 * Dependency-free: only the FEN fields that define a position are hashed
 * (piece placement, side to move, castling rights, en passant square) — the
 * clock fields are ignored.
 */
export function fnv1a64PositionHash(fen: string): bigint {
  const core = fen.trim().split(/\s+/).slice(0, 4).join(" ");
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  for (let i = 0; i < core.length; i += 1) {
    hash ^= BigInt(core.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return BigInt.asIntN(64, hash);
}
