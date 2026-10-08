import { fnv1a64PositionHash } from "./position-hash.ts";

/** Position key from the FEN fields that define a chess position (not clocks). */
export function positionKey(fen: string): bigint {
  return fnv1a64PositionHash(fen);
}
