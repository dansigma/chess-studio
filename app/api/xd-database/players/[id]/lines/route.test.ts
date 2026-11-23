import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { buildDatabase } from "../../../../../../scripts/xd-database/build.mjs";
import { otb, source } from "../../../../../../scripts/opening-book/test-helpers.mjs";
import { XD_DATABASE_PREFIX, XD_DATABASE_VERSION } from "@/src/lib/xd-database/manifest";
import { GET as players } from "../../route";
import { GET as lines } from "./route";

const root = mkdtempSync(join(tmpdir(), "xd-lines-"));
const host = globalThis as typeof globalThis & { __CF_ENV?: Record<string, unknown> };
const name = "Lima, Lucas";
const long = Array.from({ length: 60 }, (_, ply) => (ply % 2 === 0 ? "Nf3" : "Ng8")).join(" ");
const many = 230;

function request(path: string, query = "") {
  return new Request(`https://app.test/api/xd-database/${path}?${query}`, { headers: { "cf-connecting-ip": "192.0.2.30" } });
}

async function playerId(q: string) {
  const { players: found } = await (await players(request("players", `q=${encodeURIComponent(q)}`))).json();
  return found[0].id as string;
}

before(async () => {
  const fixture = [
    ...Array.from({ length: many }, (_, i) => otb("e4 e5", {
      White: name, Black: `Rival ${i}, X`, Result: "1-0", Round: String(i + 1), Date: `2000.01.${String(1 + (i % 28)).padStart(2, "0")}`,
    })),
    otb(long, { White: "Mota, Maria", Black: "Sá, Saulo", Result: "1/2-1/2", Date: "2001.01.01" }),
    otb("d4 d5", { White: "Nunes, Nair", Black: name, Result: "1-0", Date: "2002.02.02" }),
  ].join("");
  const manifest = await buildDatabase([source(fixture)], {
    outDir: root, version: XD_DATABASE_VERSION, workers: 2, bucketBits: 2, maxPly: 2, pageBytes: 128,
  });
  const files = new Map(Object.keys(manifest.files).map((file) => [
    XD_DATABASE_PREFIX + file, readFileSync(join(root, `v${XD_DATABASE_VERSION}`, file)),
  ]));
  host.__CF_ENV = {
    RL_60_MIN: { limit: async () => ({ success: true }) },
    XD_DATABASE: {
      async get(key: string, options?: { range: { offset: number; length: number } }) {
        const file = files.get(key);
        if (!file) return null;
        const range = options?.range;
        const bytes = range ? file.subarray(range.offset, range.offset + range.length) : file;
        return { arrayBuffer: async () => Uint8Array.from(bytes).buffer };
      },
    },
  };
});

after(() => {
  delete host.__CF_ENV;
  rmSync(root, { recursive: true, force: true });
});

test("lines return the newest 200 games with the player's color and result", async () => {
  const id = await playerId("lima");
  const response = await lines(request(`players/${id}/lines`), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total, many + 1);
  assert.equal(body.games.length, 200);
  assert.equal(body.games[0].white, "Nunes, Nair");
  assert.equal(body.games[0].color, "black");
  assert.equal(body.games[0].playerResult, "loss");
  assert.equal(body.games[0].moves, "d4 d5");
  assert.equal(body.games[1].color, "white");
  assert.equal(body.games[1].playerResult, "win");
  assert.equal(body.games[1].moves, "e4 e5");
  assert.equal(body.games[1].date.slice(0, 4), "2000");
});

test("lines cut moves at 50 plies and report draws", async () => {
  const id = await playerId("mota");
  const body = await (await lines(request(`players/${id}/lines`), { params: Promise.resolve({ id }) })).json();
  assert.equal(body.total, 1);
  assert.equal(body.games[0].moves.split(" ").length, 50);
  assert.equal(body.games[0].playerResult, "draw");
});

test("an unknown player returns 404", async () => {
  const response = await lines(request("players/9999-0/lines"), { params: Promise.resolve({ id: "9999-0" }) });
  assert.equal(response.status, 404);
});
