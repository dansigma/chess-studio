// SIG-1275: expected zkey rows, transpositions, and best-effort writes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { START_FEN } from "@/src/chess/tree.ts";
import { positionKey } from "@/src/chess/zobrist.ts";
import { indexMyGames, myGamePositionRows } from "./position-index.ts";

const PGN = '[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *';
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const FINAL = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

describe("myGamePositionRows", () => {
  it("emits the position before every ply plus the final position", () => {
    const rows = myGamePositionRows("g1", PGN);
    assert.deepEqual(
      rows.map((row) => row.ply),
      [1, 2, 3, 4, 1_000_001],
    );
    assert.equal(rows[0].zkey, positionKey(START_FEN).toString());
    assert.equal(rows[1].zkey, positionKey(AFTER_E4).toString());
    assert.equal(rows[4].zkey, positionKey(FINAL).toString());
    assert.ok(rows.every((row) => row.game_id === "g1" && typeof row.zkey === "string"));
  });

  it("reaches the same zkey through a transposition", () => {
    const a = myGamePositionRows("a", "1. Nf3 Nf6 2. d4 d5 *");
    const b = myGamePositionRows("b", "1. d4 d5 2. Nf3 Nf6 *");
    assert.notDeepEqual(a.map((r) => r.zkey).slice(0, 2), b.map((r) => r.zkey).slice(0, 2));
    assert.equal(a.at(-1)?.zkey, b.at(-1)?.zkey);
  });

  it("returns no rows for an unplayable PGN", () => {
    assert.deepEqual(myGamePositionRows("x", "not a game"), []);
  });
});

function fakeService(opts: { failPositionsFor?: string } = {}) {
  const written: Array<{ table: string; rows?: unknown[]; attrs?: unknown; id?: unknown }> = [];
  const client = {
    from: (table: string) => ({
      upsert: async (rows: Array<{ game_id: string }>) => {
        if (opts.failPositionsFor && rows[0]?.game_id === opts.failPositionsFor) {
          return { error: { message: "boom" } };
        }
        written.push({ table, rows });
        return { error: null };
      },
      update: (attrs: unknown) => ({
        eq: (_col: string, id: unknown) => ({
          eq: async () => {
            written.push({ table, attrs, id });
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { client: client as never, written };
}

describe("indexMyGames", () => {
  it("writes positions then stamps indexed_at", async () => {
    const { client, written } = fakeService();
    const result = await indexMyGames(client, "u1", [{ id: "g1", pgn: PGN }]);
    assert.deepEqual(result, { indexed: 1, failed: 0 });
    assert.equal(written[0].table, "my_game_positions");
    assert.equal(written[0].rows?.length, 5);
    assert.equal(written[1].table, "my_games");
    assert.equal(written[1].id, "g1");
  });

  it("leaves a failing game unindexed and keeps going", async () => {
    const { client, written } = fakeService({ failPositionsFor: "bad" });
    const result = await indexMyGames(client, "u1", [
      { id: "bad", pgn: PGN },
      { id: "ok", pgn: PGN },
    ]);
    assert.deepEqual(result, { indexed: 1, failed: 1 });
    assert.ok(!written.some((w) => w.table === "my_games" && w.id === "bad"));
    assert.ok(written.some((w) => w.table === "my_games" && w.id === "ok"));
  });
});
