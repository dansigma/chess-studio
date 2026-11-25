import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Chess } from "chess.js";
import { encodeHistory, legalMoves } from "./encode.ts";

const fixtures: { name: string; fens: string[]; tokenHash: string; legalIndices: number[] }[] =
  JSON.parse(readFileSync(new URL("./fixtures/encoder.json", import.meta.url), "utf8"));

for (const { name, fens, tokenHash, legalIndices } of fixtures) {
  test(`Maia encoder matches Python for ${name}`, () => {
    const tokens = encodeHistory(fens);
    const bytes = Buffer.alloc(tokens.byteLength);
    tokens.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), tokenHash);
    const moves = legalMoves(new Chess(fens.at(-1)));
    assert.deepEqual(moves.map(({ index }) => index).sort((a, b) => a - b), legalIndices);
  });
}
