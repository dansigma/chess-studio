import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { ByteWriter, encodeGamesIndex, encodePlayersIndex, playerSearchKey, writePlayerEntry } from "./format.ts";
import { XdDatabaseReader } from "./reader.ts";

test("finds players by normalized word prefixes in any order", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "xd-reader-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const players = [
    { name: "Leitao Dualibe, Rafael", count: 10 },
    { name: "Leitao, Nicolau", count: 10 },
    { name: "Leitao, Rafael", count: 50 },
    { name: "Ramos, Raul", count: 30 },
    { name: "Vescovi, Giovanni", count: 40 },
  ];
  const firstKeys = players.map(({ name }) => playerSearchKey(name));
  const offsets = [0];
  const pages = players.map(({ name, count }, page) => {
    const writer = new ByteWriter();
    writePlayerEntry(writer, {
      name, count, searchKey: firstKeys[page], fideId: 0, start: 0, firstYear: 0, lastYear: 0,
    });
    const bytes = deflateRawSync(writer.result());
    offsets.push(offsets[page] + bytes.length);
    return bytes;
  });
  writeFileSync(join(root, "players.bin"), Buffer.concat(pages));
  writeFileSync(join(root, "players.idx"), encodePlayersIndex({ playerCount: players.length, firstKeys, offsets }));

  const reader = new XdDatabaseReader(async (file, range) => {
    const bytes = readFileSync(join(root, file));
    return range ? bytes.subarray(range.start, range.end) : bytes;
  });
  const names = async (query: string, limit?: number) =>
    (await reader.searchPlayersByWords(query, limit)).map(({ name }) => name);

  for (const query of ["Rafael Leitão", "leitao rafael", "Leitão,Rafael", "RAF lei"]) {
    assert.deepEqual(await names(query), ["Leitao, Rafael", "Leitao Dualibe, Rafael"], query);
  }
  assert.deepEqual(await names("giovanni vescovi"), ["Vescovi, Giovanni"]);
  assert.deepEqual(await names("leitao"), ["Leitao, Rafael", "Leitao Dualibe, Rafael", "Leitao, Nicolau"]);
  assert.deepEqual(await names("leitao", 1), ["Leitao, Rafael"]);
  assert.deepEqual(await names("leitao rafael missing"), []);
  assert.deepEqual(await names("leitao afael"), []);
  assert.deepEqual(await names("lei leitao raf rafael ignored"), ["Leitao, Rafael", "Leitao Dualibe, Rafael"]);
  assert.deepEqual(await names("ra rau"), ["Ramos, Raul"]);
  assert.deepEqual(await names(" , , "), []);
});


test("reads v2 game records without trailing opening fields", async () => {
  const line = ["Alpha, A", "Beta, B", 2400, 2300, "1-0", "2020.03.05", "Open",
    null, "1", "D00o", null, null, null, null, "d4 Nf6 Nc3 d5 Bf4 c5"];
  const block = deflateRawSync(JSON.stringify(line));
  const index = encodeGamesIndex({ gamesPerBlock: 256, gameCount: 1, offsets: [0, block.length] });
  new DataView(index.buffer, index.byteOffset).setUint32(4, 2, true);
  const reader = new XdDatabaseReader(async (file) => file === "games.idx" ? index : block);
  const game = await reader.game(0);
  assert.equal(game?.eco, "D00o");
  assert.equal(game?.moves, line[14]);
  assert.equal(game?.openingEco, null);
  assert.equal(game?.openingName, null);
});
