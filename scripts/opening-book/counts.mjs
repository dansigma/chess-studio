// scripts/opening-book/counts.mjs
// SIG-1226: bounded-memory counting of (position, move) pairs.
//
// Every move of every kept game (up to the ply cap) bumps a (position key,
// move) counter and a per-position total (stored under the pseudo move TOTAL).
// The counters live in a Map; when it reaches `maxEntries` it is sorted and
// spilled to a temporary run file, and the runs are merged (summing equal
// pairs) at the end. RAM is therefore bounded by maxEntries, not by the month:
// measured at about 300 bytes per entry in the whole process (20-character
// string key, Map slot, chess.js garbage), so the default of 3,000,000 entries
// is roughly 1 GB.
//
// Map keys are 16 hex digits of the unsigned position key followed by 4 hex
// digits of the move code, so the default string sort IS numeric (key, move)
// order. Run records are 14 bytes, big-endian: key u64, move u16, count u32.
import { closeSync, mkdtempSync, openSync, readSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TOTAL = 0xffff;
const RECORD = 14;
const CHUNK_RECORDS = 65536;

export class CountStore {
  constructor({ maxEntries = 3_000_000, tmpDir = null } = {}) {
    this.maxEntries = maxEntries;
    this.tmpRoot = tmpDir;
    this.dir = null;
    this.map = new Map();
    this.runs = [];
    this.spills = 0;
  }

  /** One game passes through `key` and plays `move`. */
  add(key, move) {
    const prefix = BigInt.asUintN(64, key).toString(16).padStart(16, "0");
    this.#bump(prefix + move.toString(16).padStart(4, "0"));
    this.#bump(prefix + TOTAL.toString(16));
    if (this.map.size >= this.maxEntries) {
      this.#spill();
    }
  }

  #bump(id) {
    this.map.set(id, (this.map.get(id) ?? 0) + 1);
  }

  #spill() {
    if (this.map.size === 0) {
      return;
    }
    if (!this.dir) {
      this.dir = mkdtempSync(join(this.tmpRoot ?? tmpdir(), "opening-book-"));
    }
    const path = join(this.dir, `run-${this.runs.length}.bin`);
    const fd = openSync(path, "w");
    const ids = [...this.map.keys()].sort();
    const buffer = Buffer.alloc(CHUNK_RECORDS * RECORD);
    let filled = 0;
    for (const id of ids) {
      writeRecord(buffer, filled * RECORD, id, this.map.get(id));
      filled += 1;
      if (filled === CHUNK_RECORDS) {
        writeSync(fd, buffer, 0, filled * RECORD);
        filled = 0;
      }
    }
    if (filled > 0) {
      writeSync(fd, buffer, 0, filled * RECORD);
    }
    closeSync(fd);
    this.runs.push(path);
    this.spills += 1;
    this.map = new Map();
  }

  /** Sorted, merged { key, move, count } records (key is an unsigned bigint). */
  *merged() {
    const readers = this.runs.map((path) => new RunReader(path));
    const ids = [...this.map.keys()].sort();
    let memory = 0;
    const memoryHead = () => (memory < ids.length ? { id: ids[memory], count: this.map.get(ids[memory]) } : null);
    try {
      for (;;) {
        let best = null;
        const head = memoryHead();
        if (head) {
          best = head;
        }
        for (let i = 0; i < readers.length; i += 1) {
          const candidate = readers[i].peek();
          if (candidate && (best === null || candidate.id < best.id)) {
            best = candidate;
            }
        }
        if (best === null) {
          return;
        }
        const id = best.id;
        let count = 0;
        if (head && head.id === id) {
          count += head.count;
          memory += 1;
        }
        for (const reader of readers) {
          const candidate = reader.peek();
          if (candidate && candidate.id === id) {
            count += candidate.count;
            reader.advance();
          }
        }
        yield { key: BigInt(`0x${id.slice(0, 16)}`), move: parseInt(id.slice(16), 16), count };
      }
    } finally {
      for (const reader of readers) {
        reader.close();
      }
    }
  }

  dispose() {
    if (this.dir) {
      rmSync(this.dir, { recursive: true, force: true });
      this.dir = null;
    }
    this.runs = [];
    this.map = new Map();
  }
}

function writeRecord(buffer, offset, id, count) {
  buffer.writeBigUInt64BE(BigInt(`0x${id.slice(0, 16)}`), offset);
  buffer.writeUInt16BE(parseInt(id.slice(16), 16), offset + 8);
  buffer.writeUInt32BE(count, offset + 10);
}

class RunReader {
  constructor(path) {
    this.fd = openSync(path, "r");
    this.buffer = Buffer.alloc(CHUNK_RECORDS * RECORD);
    this.length = 0;
    this.position = 0;
    this.current = null;
    this.advance();
  }

  peek() {
    return this.current;
  }

  advance() {
    if (this.position >= this.length) {
      this.length = readSync(this.fd, this.buffer, 0, this.buffer.length, null);
      this.position = 0;
      if (this.length === 0) {
        this.current = null;
        return;
      }
    }
    const at = this.position;
    this.current = {
      id:
        this.buffer.readBigUInt64BE(at).toString(16).padStart(16, "0") +
        this.buffer.readUInt16BE(at + 8).toString(16).padStart(4, "0"),
      count: this.buffer.readUInt32BE(at + 10),
    };
    this.position += RECORD;
  }

  close() {
    closeSync(this.fd);
  }
}

/**
 * Applies the book rule to merged counts. A position is theory-bearing when it
 * has at least `minPositionGames` games; a move is kept when it has at least
 * `minMoveGames` games AND at least `minMoveShare` of the position's games.
 * Returns { entries: [{ key, move }], positions, positionsSeen, movesSeen }.
 */
export function selectTheory(records, rule) {
  const entries = [];
  const keptKeys = new Set();
  let positionsSeen = 0;
  let movesSeen = 0;
  let group = null;
  const flush = () => {
    if (!group) {
      return;
    }
    positionsSeen += 1;
    const total = group.total;
    if (total >= rule.minPositionGames) {
      for (const move of group.moves) {
        if (move.count >= rule.minMoveGames && move.count >= rule.minMoveShare * total) {
          entries.push({ key: group.key, move: move.move });
          keptKeys.add(group.key);
        }
      }
    }
    group = null;
  };
  for (const record of records) {
    if (!group || group.key !== record.key) {
      flush();
      group = { key: record.key, total: 0, moves: [] };
    }
    if (record.move === TOTAL) {
      group.total = record.count;
    } else {
      movesSeen += 1;
      group.moves.push(record);
    }
  }
  flush();
  return { entries, positions: keptKeys.size, positionsSeen, movesSeen };
}
