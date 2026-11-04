// SIG-1210: bounded-memory scanner for "one huge JSON object whose payload is
// an array of small objects" (Chess.com monthly archives: `{"games":[{...},…]}`).
//
// The scanner never builds the whole document. It walks the text one chunk at
// a time, tracking bracket depth, string state and backslash escapes, and hands
// each top-level element of the target array to `onObject` as raw JSON text.
// Callers `JSON.parse` elements one by one and keep only what they need, so
// peak memory is O(one element + what the caller retains), not O(response).
//
// Web-standard only (ReadableStream + TextDecoder): runs on Cloudflare Workers.

export class JsonStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonStreamError";
  }
}

const OPEN_BRACE = 0x7b; // {
const CLOSE_BRACE = 0x7d; // }
const OPEN_BRACKET = 0x5b; // [
const CLOSE_BRACKET = 0x5d; // ]
const QUOTE = 0x22; // "
const BACKSLASH = 0x5c; // \
const COMMA = 0x2c;
const COLON = 0x3a;

const MAX_KEY_CHARS = 128;
/** A single array element above this many UTF-16 units is treated as malformed. */
export const DEFAULT_MAX_OBJECT_CHARS = 1024 * 1024;

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x0a || code === 0x0d || code === 0x09 || code === 0xfeff;
}

export type JsonArrayScannerOptions = {
  /** Key of the root-object array to scan, e.g. "games". */
  arrayKey: string;
  maxObjectChars?: number;
};

export class JsonArrayScanner {
  private readonly arrayKey: string;
  private readonly maxObjectChars: number;
  private readonly onObject: (json: string) => void;

  private readonly stack: number[] = [];
  private inString = false;
  private escaped = false;
  private started = false;
  private rootClosed = false;
  // Root-level key tracking.
  private expectKey = false;
  private collectingKey = false;
  private keyBuf = "";
  private keyDirty = false; // key contained an escape or overflowed: never matches
  private lastKey: string | null = null;
  // Target array state.
  private arrayActive = false;
  private arrayDone = false;
  private found = false;
  // Element capture.
  private capturing = false;
  private parts: string[] = [];
  private captured = 0;

  constructor(options: JsonArrayScannerOptions, onObject: (json: string) => void) {
    this.arrayKey = options.arrayKey;
    this.maxObjectChars = options.maxObjectChars ?? DEFAULT_MAX_OBJECT_CHARS;
    this.onObject = onObject;
  }

  /** True once the target array key has been seen (even if the array is empty). */
  get foundArray(): boolean {
    return this.found;
  }

  write(chunk: string): void {
    // Start of the pending slice of an in-flight element (0 when it began in
    // an earlier chunk).
    let segStart = 0;
    const length = chunk.length;
    for (let i = 0; i < length; i += 1) {
      const code = chunk.charCodeAt(i);
      if (this.inString) {
        if (this.escaped) {
          this.escaped = false;
          if (this.collectingKey) {
            this.keyDirty = true;
          }
        } else if (code === BACKSLASH) {
          this.escaped = true;
        } else if (code === QUOTE) {
          this.inString = false;
          if (this.collectingKey) {
            this.collectingKey = false;
            this.lastKey = this.keyDirty ? null : this.keyBuf;
            this.keyBuf = "";
          }
        } else if (this.collectingKey && !this.keyDirty) {
          if (this.keyBuf.length >= MAX_KEY_CHARS) {
            this.keyDirty = true;
          } else {
            this.keyBuf += chunk[i];
          }
        }
        continue;
      }
      if (isWhitespace(code)) {
        continue;
      }
      if (this.rootClosed) {
        throw new JsonStreamError("Unexpected data after the root JSON value");
      }
      switch (code) {
        case QUOTE: {
          this.inString = true;
          this.escaped = false;
          if (this.stack.length === 1 && this.expectKey) {
            this.collectingKey = true;
            this.keyBuf = "";
            this.keyDirty = false;
          }
          break;
        }
        case OPEN_BRACE:
        case OPEN_BRACKET: {
          if (this.stack.length === 0) {
            if (code !== OPEN_BRACE) {
              throw new JsonStreamError("Expected a JSON object at the document root");
            }
            this.started = true;
            this.expectKey = true;
          } else if (this.stack.length === 1 && code === OPEN_BRACKET) {
            if (!this.found && !this.arrayDone && !this.expectKey && this.lastKey === this.arrayKey) {
              this.arrayActive = true;
              this.found = true;
            }
          } else if (this.stack.length === 2 && this.arrayActive && code === OPEN_BRACE) {
            this.capturing = true;
            this.parts = [];
            this.captured = 0;
            segStart = i;
          }
          this.stack.push(code);
          break;
        }
        case CLOSE_BRACE:
        case CLOSE_BRACKET: {
          const open = this.stack.pop();
          if (open === undefined || (code === CLOSE_BRACE) !== (open === OPEN_BRACE)) {
            throw new JsonStreamError("Mismatched closing bracket in JSON stream");
          }
          if (this.stack.length === 0) {
            this.rootClosed = true;
          } else if (this.capturing && this.stack.length === 2 && code === CLOSE_BRACE) {
            this.parts.push(chunk.slice(segStart, i + 1));
            this.captured += i + 1 - segStart;
            if (this.captured > this.maxObjectChars) {
              throw new JsonStreamError("JSON array element exceeds the size limit");
            }
            const json = this.parts.length === 1 ? (this.parts[0] as string) : this.parts.join("");
            this.parts = [];
            this.capturing = false;
            this.captured = 0;
            this.onObject(json);
          } else if (this.arrayActive && this.stack.length === 1 && code === CLOSE_BRACKET) {
            this.arrayActive = false;
            this.arrayDone = true;
          }
          break;
        }
        case COMMA: {
          if (this.stack.length === 1) {
            this.expectKey = true;
            this.lastKey = null;
          }
          break;
        }
        case COLON: {
          if (this.stack.length === 1) {
            this.expectKey = false;
          }
          break;
        }
        default:
          break;
      }
    }
    if (this.capturing) {
      const slice = chunk.slice(segStart);
      this.parts.push(slice);
      this.captured += slice.length;
      if (this.captured > this.maxObjectChars) {
        throw new JsonStreamError("JSON array element exceeds the size limit");
      }
    }
  }

  /** Call once after the last chunk. Throws if the document was cut off or empty. */
  finish(): void {
    if (!this.started) {
      throw new JsonStreamError("Empty or non-object JSON document");
    }
    if (this.inString || this.stack.length > 0 || !this.rootClosed) {
      throw new JsonStreamError("Unexpected end of JSON stream");
    }
  }
}

/** Keeps the last `limit` pushed items (oldest dropped first) in O(limit) memory. */
export class RingBuffer<T> {
  private readonly limit: number;
  private readonly items: T[] = [];
  private head = 0;

  constructor(limit: number) {
    this.limit = Math.max(0, Math.floor(limit));
  }

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    if (this.limit === 0) {
      return;
    }
    if (this.items.length < this.limit) {
      this.items.push(item);
      return;
    }
    this.items[this.head] = item;
    this.head = (this.head + 1) % this.limit;
  }

  /** Items oldest to newest. */
  toArray(): T[] {
    if (this.items.length < this.limit || this.head === 0) {
      return this.items.slice();
    }
    return [...this.items.slice(this.head), ...this.items.slice(0, this.head)];
  }
}

export type StreamArrayTailOptions<T> = {
  arrayKey: string;
  /** Keep only the newest (= last) `keepLast` accepted elements. */
  keepLast: number;
  /** Absolute safety cap on bytes read from the body. */
  maxBytes: number;
  /** Optional per-element filter, applied before the ring buffer. */
  accept?: (item: T) => boolean;
  maxObjectChars?: number;
};

export type StreamArrayTailResult<T> = {
  /** Kept elements, oldest to newest. */
  items: T[];
  /** True when the byte cap stopped the read early (items are then incomplete). */
  truncated: boolean;
  foundArray: boolean;
  bytesRead: number;
  /** Elements seen in the array (accepted or not). */
  seen: number;
};

/**
 * Streams a JSON body and returns the last `keepLast` elements of its
 * `arrayKey` array. Elements are parsed one at a time and discarded unless
 * they stay in the ring buffer. Hitting `maxBytes` returns what was kept with
 * `truncated: true` instead of throwing. Malformed JSON throws.
 */
export async function streamArrayTail<T>(
  body: ReadableStream<Uint8Array> | null,
  options: StreamArrayTailOptions<T>,
): Promise<StreamArrayTailResult<T>> {
  const ring = new RingBuffer<T>(options.keepLast);
  let seen = 0;
  const scanner = new JsonArrayScanner(
    { arrayKey: options.arrayKey, maxObjectChars: options.maxObjectChars },
    (json) => {
      seen += 1;
      let item: T;
      try {
        item = JSON.parse(json) as T;
      } catch {
        throw new JsonStreamError("Invalid JSON inside array element");
      }
      if (!options.accept || options.accept(item)) {
        ring.push(item);
      }
    },
  );
  if (!body) {
    return { items: [], truncated: false, foundArray: false, bytesRead: 0, seen: 0 };
  }
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let bytesRead = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      if (bytesRead + value.byteLength > options.maxBytes) {
        truncated = true;
        break;
      }
      bytesRead += value.byteLength;
      scanner.write(decoder.decode(value, { stream: true }));
    }
    if (!truncated) {
      scanner.write(decoder.decode());
      scanner.finish();
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // ignore secondary cancel failure
    }
    throw error;
  }
  if (truncated) {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
  return { items: ring.toArray(), truncated, foundArray: scanner.foundArray, bytesRead, seen };
}
