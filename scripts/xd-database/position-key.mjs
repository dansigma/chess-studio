// scripts/xd-database/position-key.mjs
// SIG-1449: the app's position key (`bookKey`: unsigned FNV-1a 64 of the first
// four FEN fields) computed with 32-bit integer math instead of BigInt, which is
// about two orders of magnitude faster. The database build hashes hundreds of
// millions of positions; position-key.test.mjs checks it against `bookKey`.

const PRIME_LO = 0x1b3; // FNV 64 prime = 2^40 + 0x1b3
const OFFSET_HI = 0xcbf29ce4;
const OFFSET_LO = 0x84222325;
const TWO_32 = 4294967296;

/**
 * Unsigned key of a FEN as two unsigned 32-bit halves. `out` receives
 * [hi, lo]; it is returned so callers can reuse one array.
 */
export function positionKeyParts(fen, out = [0, 0]) {
  let hi = OFFSET_HI;
  let lo = OFFSET_LO;
  let spaces = 0;
  for (let i = 0; i < fen.length; i += 1) {
    const c = fen.charCodeAt(i);
    if (c === 32) {
      spaces += 1;
      if (spaces === 4) {
        break;
      }
    }
    lo = (lo ^ c) >>> 0;
    // (hi:lo) * (2^40 + 0x1b3) mod 2^64
    const t = lo * PRIME_LO; // < 2^41, exact
    const carry = Math.floor(t / TWO_32);
    const nextLo = t >>> 0;
    hi = (Math.imul(hi, PRIME_LO) + carry + Math.imul(lo, 256)) >>> 0;
    lo = nextLo;
  }
  out[0] = hi;
  out[1] = lo;
  return out;
}

/** The same key as a BigInt (unsigned). */
export function positionKeyBigInt(fen) {
  const [hi, lo] = positionKeyParts(fen);
  return (BigInt(hi) << 32n) | BigInt(lo);
}
