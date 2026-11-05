// scripts/opening-book/hashset.mjs
// SIG-1229: memory-lean set of 64-bit hashes for de-duplicating ~10 million
// games. Open addressing over two Uint32Arrays plus a used flag (9 bytes per
// slot, at most 50% full): 10 million games end in 2^25 slots, about 300 MB,
// with the previous table (half that) alive for a moment while it doubles. A
// Set<number> would cost around 50 bytes per entry.

/** Two independent 32-bit hashes of a string, as a [hi, lo] pair. */
export function hash64(text) {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
    b ^= b >>> 15;
  }
  a ^= a >>> 16;
  a = Math.imul(a, 0x85ebca6b);
  a ^= a >>> 13;
  b = Math.imul(b ^ (b >>> 16), 0xc2b2ae35);
  b ^= b >>> 13;
  return [a >>> 0, b >>> 0];
}

export class HashSet64 {
  constructor(initialSlots = 1 << 16) {
    this.slots = initialSlots;
    this.hi = new Uint32Array(this.slots);
    this.lo = new Uint32Array(this.slots);
    this.used = new Uint8Array(this.slots);
    this.size = 0;
  }

  /** Adds the pair; returns true when it was NOT already present. */
  add(hi, lo) {
    if ((this.size + 1) * 2 > this.slots) {
      this.#grow();
    }
    return this.#insert(hi, lo);
  }

  #insert(hi, lo) {
    const mask = this.slots - 1;
    let at = (lo ^ Math.imul(hi, 0x9e3779b1)) & mask;
    for (;;) {
      if (this.used[at] === 0) {
        this.used[at] = 1;
        this.hi[at] = hi;
        this.lo[at] = lo;
        this.size += 1;
        return true;
      }
      if (this.hi[at] === hi && this.lo[at] === lo) {
        return false;
      }
      at = (at + 1) & mask;
    }
  }

  #grow() {
    const { hi, lo, used, slots } = this;
    this.slots = slots * 2;
    this.hi = new Uint32Array(this.slots);
    this.lo = new Uint32Array(this.slots);
    this.used = new Uint8Array(this.slots);
    this.size = 0;
    for (let i = 0; i < slots; i += 1) {
      if (used[i]) {
        this.#insert(hi[i], lo[i]);
      }
    }
  }
}
