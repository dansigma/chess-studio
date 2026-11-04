import assert from "node:assert/strict";
import test from "node:test";
import {
  JsonArrayScanner,
  JsonStreamError,
  RingBuffer,
  streamArrayTail,
} from "./json-array-stream.ts";

function scanChunks(chunks: string[], arrayKey = "games"): { objects: string[]; found: boolean } {
  const objects: string[] = [];
  const scanner = new JsonArrayScanner({ arrayKey }, (json) => objects.push(json));
  for (const chunk of chunks) {
    scanner.write(chunk);
  }
  scanner.finish();
  return { objects, found: scanner.foundArray };
}

function splitEvery(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push(text.slice(i, i + size));
  }
  return out;
}

function bodyFromBytes(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

const SAMPLE = JSON.stringify({
  note: "before",
  games: [
    { id: 1, pgn: '[Event "x"]\n1. e4 {a } brace} e5', nested: { deep: [1, { a: "}" }] } },
    { id: 2, pgn: 'quote \\" and \\\\ backslash } {' },
    { id: 3 },
  ],
  after: { games: [{ id: "ignored" }] },
});

test("scanner yields each game from one chunk", () => {
  const { objects, found } = scanChunks([SAMPLE]);
  assert.equal(found, true);
  assert.deepEqual(
    objects.map((json) => (JSON.parse(json) as { id: number }).id),
    [1, 2, 3],
  );
});

test("scanner output is identical for every chunk size (splits inside strings and escapes)", () => {
  const expected = scanChunks([SAMPLE]).objects;
  for (let size = 1; size <= 40; size += 1) {
    assert.deepEqual(scanChunks(splitEvery(SAMPLE, size)).objects, expected, `chunk size ${size}`);
  }
});

test("braces, brackets and escaped quotes inside strings do not change depth", () => {
  const text = JSON.stringify({
    games: [{ pgn: '1. e4 {comment with } and ] and "quotes"} e5 \\ {{{' }, { pgn: "}}}]]]" }],
  });
  for (const size of [1, 2, 3, 7, text.length]) {
    const { objects } = scanChunks(splitEvery(text, size));
    assert.equal(objects.length, 2, `chunk size ${size}`);
    assert.equal((JSON.parse(objects[1] as string) as { pgn: string }).pgn, "}}}]]]");
  }
});

test("a backslash at the very end of a chunk escapes the first char of the next", () => {
  const text = '{"games":[{"a":"x\\"y}"},{"b":1}]}';
  const cut = text.indexOf('\\"') + 1; // chunk ends right after the backslash
  const { objects } = scanChunks([text.slice(0, cut), text.slice(cut)]);
  assert.deepEqual(objects, ['{"a":"x\\"y}"}', '{"b":1}']);
});

test("empty array yields nothing but is found", () => {
  const { objects, found } = scanChunks(['{"games":', "[", "]}"]);
  assert.deepEqual(objects, []);
  assert.equal(found, true);
});

test("missing games key yields nothing and is not found", () => {
  const { objects, found } = scanChunks(['{"other":[{"a":1}],"x":{"games":[{"a":2}]}}']);
  assert.deepEqual(objects, []);
  assert.equal(found, false);
});

test("a string value equal to the key is not mistaken for the key", () => {
  const { objects, found } = scanChunks(['{"name":"games","list":[{"a":1}]}']);
  assert.deepEqual(objects, []);
  assert.equal(found, false);
});

test("non-object array members are skipped", () => {
  const { objects } = scanChunks(['{"games":[1,"two",null,{"a":3},[4]]}']);
  assert.deepEqual(objects, ['{"a":3}']);
});

test("malformed input throws JsonStreamError", () => {
  const cases: Record<string, string> = {
    truncated: '{"games":[{"a":1},{"a":',
    "cut inside string": '{"games":[{"a":"abc',
    "mismatched bracket": '{"games":[{"a":1]}',
    "array root": '[{"a":1}]',
    empty: "   ",
    "trailing data": '{"games":[]} {"x":1}',
    "unterminated root": '{"games":[]',
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.throws(() => scanChunks(splitEvery(text, 5)), JsonStreamError, name);
  }
});

test("an oversized element is rejected", () => {
  const scanner = new JsonArrayScanner({ arrayKey: "games", maxObjectChars: 20 }, () => {});
  assert.throws(
    () => scanner.write('{"games":[{"pgn":"' + "x".repeat(100) + '"}]}'),
    JsonStreamError,
  );
});

test("RingBuffer keeps the newest items in order", () => {
  const ring = new RingBuffer<number>(3);
  assert.deepEqual(ring.toArray(), []);
  for (let i = 1; i <= 2; i += 1) {
    ring.push(i);
  }
  assert.deepEqual(ring.toArray(), [1, 2]);
  for (let i = 3; i <= 8; i += 1) {
    ring.push(i);
  }
  assert.deepEqual(ring.toArray(), [6, 7, 8]);
  assert.equal(ring.size, 3);
  const none = new RingBuffer<number>(0);
  none.push(1);
  assert.deepEqual(none.toArray(), []);
});

test("streamArrayTail keeps only the newest `keepLast` elements", async () => {
  const games = Array.from({ length: 100 }, (_, i) => ({ id: i, pgn: `game ${i} {x}` }));
  const bytes = new TextEncoder().encode(JSON.stringify({ games }));
  const result = await streamArrayTail<{ id: number }>(bodyFromBytes(bytes, 13), {
    arrayKey: "games",
    keepLast: 5,
    maxBytes: 1_000_000,
  });
  assert.deepEqual(
    result.items.map((game) => game.id),
    [95, 96, 97, 98, 99],
  );
  assert.equal(result.seen, 100);
  assert.equal(result.truncated, false);
});

test("streamArrayTail applies the accept filter before the ring buffer", async () => {
  const games = Array.from({ length: 20 }, (_, i) => ({ id: i }));
  const bytes = new TextEncoder().encode(JSON.stringify({ games }));
  const result = await streamArrayTail<{ id: number }>(bodyFromBytes(bytes, 7), {
    arrayKey: "games",
    keepLast: 3,
    maxBytes: 1_000_000,
    accept: (game) => game.id % 2 === 0,
  });
  assert.deepEqual(
    result.items.map((game) => game.id),
    [14, 16, 18],
  );
});

test("streamArrayTail decodes multi-byte characters split across byte chunks", async () => {
  const name = "Árvíztűrő tükörfúrógép 国际象棋 ♞♞ 😀😀";
  const bytes = new TextEncoder().encode(JSON.stringify({ games: [{ name }, { name: "b" }] }));
  for (const size of [1, 2, 3, 5]) {
    const result = await streamArrayTail<{ name: string }>(bodyFromBytes(bytes, size), {
      arrayKey: "games",
      keepLast: 10,
      maxBytes: 1_000_000,
    });
    assert.equal(result.items[0]?.name, name, `byte chunk size ${size}`);
  }
});

test("streamArrayTail returns what it kept and flags truncated at the byte cap", async () => {
  const games = Array.from({ length: 50 }, (_, i) => ({ id: i, pad: "x".repeat(40) }));
  const bytes = new TextEncoder().encode(JSON.stringify({ games }));
  const result = await streamArrayTail<{ id: number }>(bodyFromBytes(bytes, 50), {
    arrayKey: "games",
    keepLast: 100,
    maxBytes: 500,
  });
  assert.equal(result.truncated, true);
  assert.ok(result.items.length > 0 && result.items.length < 50);
  assert.ok(result.bytesRead <= 500);
});

test("streamArrayTail throws on malformed bodies and invalid element JSON", async () => {
  const enc = new TextEncoder();
  await assert.rejects(
    streamArrayTail(bodyFromBytes(enc.encode('{"games":[{"a":1},{"a":'), 8), {
      arrayKey: "games",
      keepLast: 5,
      maxBytes: 1000,
    }),
    JsonStreamError,
  );
  await assert.rejects(
    streamArrayTail(bodyFromBytes(enc.encode('{"games":[{"a":nope}]}'), 8), {
      arrayKey: "games",
      keepLast: 5,
      maxBytes: 1000,
    }),
    JsonStreamError,
  );
});

test("streamArrayTail treats a null body as empty", async () => {
  const result = await streamArrayTail(null, { arrayKey: "games", keepLast: 5, maxBytes: 10 });
  assert.deepEqual(result.items, []);
  assert.equal(result.foundArray, false);
});
