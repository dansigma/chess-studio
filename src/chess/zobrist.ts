/** Position key from the FEN fields that define a chess position (not clocks). */
export function positionKey(fen: string): bigint {
  const parts = fen.trim().split(/\s+/);
  const core = parts.slice(0, 4).join(" ");
  return fnv1a64(core);
}

function fnv1a64(input: string): bigint {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return BigInt.asIntN(64, hash);
}
