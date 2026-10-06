import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { importPgn } from "../chess/pgn.ts";

// The seed data lives boundary-free in `seed-data.ts` (`seed.ts` keeps only
// the `server-only` marker + re-export). This contract test reads the data
// file as text: a seed change without a matching fixture edit fails the
// suite instead of passing silently.
const seedSource = readFileSync(new URL("./seed-data.ts", import.meta.url), "utf8");

function seedPgns(): string[] {
  const blocks: string[] = [];
  for (const match of seedSource.matchAll(/const\s+[A-Z0-9_]+\s*=\s*`([\s\S]*?)`;/g)) {
    if (/\[Result\s+"/.test(match[1])) {
      blocks.push(match[1]);
    }
  }
  return blocks;
}

describe("seed contract", () => {
  it("ships PGN lines that parse to moves", () => {
    const pgns = seedPgns();
    assert.ok(pgns.length > 0, "expected PGN blocks in seed-data.ts");
    for (const pgn of pgns) {
      assert.ok(importPgn(pgn).tree.children.length > 0, "a shipped seed PGN parses to no moves");
    }
  });

  it("keeps the course the catalog fixture mirrors", () => {
    assert.ok(seedSource.includes('slug: "caro-kann"'));
    assert.ok(seedSource.includes('title: "The Caro-Kann Defense"'));
  });

  it("keeps the Caro-Kann line the lesson fixture mirrors", () => {
    assert.ok(seedSource.includes("Caro-Kann"));
    for (const move of ["1. e4", "c6", "2. d4 d5"]) {
      assert.ok(seedSource.includes(move), `seed no longer contains ${move}`);
    }
  });

  it("keeps the four shipped line addresses", () => {
    for (const id of ["advance-c3", "advance-c4", "advance-nf3", "classical-main"]) {
      assert.ok(seedSource.includes(`id: "${id}"`), `seed no longer ships line ${id}`);
    }
  });
});
