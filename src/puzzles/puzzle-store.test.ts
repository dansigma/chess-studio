// SIG-1102: tests for the server-only puzzle table store (table-first, catalog fallback).
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { PUZZLE_CATALOG } from "./catalog.ts";

type Row = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  popularity: number | null;
  nb_plays: number | null;
};

const holder: {
  rpcImpl: ((fn: string, args: unknown) => Promise<{ data: Row[] | null; error: unknown }>) | null;
  fromImpl: (() => unknown) | null;
} = {
  rpcImpl: null,
  fromImpl: null,
};

mock.module("@/src/lib/supabase/server.ts", {
  namedExports: {
    createPublicServerSupabase: () => ({
      rpc: (fn: string, args: unknown) => holder.rpcImpl?.(fn, args),
      from: (table: string) => {
        void table;
        return holder.fromImpl?.();
      },
    }),
    // SIG-1179: unseen path uses the cookie-session client; default mock has
    // no session so `unseen: true` falls back to puzzles_window.
    createServerSupabase: async () => null,
  },
});

const { queryPuzzleTable, fetchPuzzleRowById } = await import("./puzzle-store.ts");

const GOOD_ROW: Row = {
  id: PUZZLE_CATALOG[0]!.id,
  fen: PUZZLE_CATALOG[0]!.fen,
  moves: [...PUZZLE_CATALOG[0]!.moves],
  rating: PUZZLE_CATALOG[0]!.rating,
  themes: [...PUZZLE_CATALOG[0]!.themes],
  popularity: 90,
  nb_plays: 600,
};

const GOOD_ROW_2: Row = {
  id: PUZZLE_CATALOG[3]!.id,
  fen: PUZZLE_CATALOG[3]!.fen,
  moves: [...PUZZLE_CATALOG[3]!.moves],
  rating: PUZZLE_CATALOG[3]!.rating,
  themes: [...PUZZLE_CATALOG[3]!.themes],
  popularity: 95,
  nb_plays: 800,
};

const BAD_ROW: Row = {
  id: "bad-row",
  fen: "not-a-fen",
  moves: ["e4"],
  rating: 1500,
  themes: ["fork"],
  popularity: null,
  nb_plays: null,
};

function eqChain(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
  };
}

test("queryPuzzleTable compiles rows from the table", async () => {
  holder.rpcImpl = async () => ({ data: [GOOD_ROW, GOOD_ROW_2], error: null });
  const result = await queryPuzzleTable({ minRating: 1400, maxRating: 1600, seed: 7 });
  assert.ok(result);
  assert.deepEqual(
    result.map((p) => p.id),
    [GOOD_ROW.id, GOOD_ROW_2.id],
  );
});

test("queryPuzzleTable returns null when the table is empty or errors", async () => {
  holder.rpcImpl = async () => ({ data: [], error: null });
  assert.equal(await queryPuzzleTable({ minRating: 1400, maxRating: 1600 }), null);
  holder.rpcImpl = async () => ({ data: null, error: new Error("db down") });
  assert.equal(await queryPuzzleTable({ minRating: 1400, maxRating: 1600 }), null);
});

test("queryPuzzleTable passes large seeds above int4 max to the RPC intact", async () => {
  let seedSeen: number | null = null;
  holder.rpcImpl = (async (_fn: string, args: unknown) => {
    seedSeen = (args as { p_seed: number | null }).p_seed;
    return { data: [GOOD_ROW], error: null };
  }) as typeof holder.rpcImpl;
  const result = await queryPuzzleTable({ minRating: 1400, maxRating: 1600, seed: 3000000000 });
  assert.ok(result);
  assert.equal(seedSeen, 3000000000);
});

test("queryPuzzleTable skips bad rows and warns once", async () => {
  holder.rpcImpl = async () => ({ data: [BAD_ROW, GOOD_ROW], error: null });
  let warns = 0;
  const original = console.warn;
  console.warn = () => {
    warns += 1;
  };
  try {
    const first = await queryPuzzleTable({ minRating: 1400, maxRating: 1600 });
    const second = await queryPuzzleTable({ minRating: 1400, maxRating: 1600 });
    assert.equal(first?.length, 1);
    assert.equal(first?.[0]?.id, GOOD_ROW.id);
    assert.equal(second?.length, 1);
    assert.equal(warns, 1);
  } finally {
    console.warn = original;
  }
});

test("queryPuzzleTable with unseen falls back to puzzles_window without a session", async () => {
  const calls: string[] = [];
  holder.rpcImpl = (async (fn: string) => {
    calls.push(fn);
    return { data: [GOOD_ROW], error: null };
  }) as typeof holder.rpcImpl;
  const result = await queryPuzzleTable({ minRating: 1400, maxRating: 1600, unseen: true });
  assert.ok(result);
  assert.deepEqual(calls, ["puzzles_window"]);
});

test("fetchPuzzleRowById returns the row and null on miss", async () => {
  holder.fromImpl = () => eqChain({ data: GOOD_ROW, error: null });
  assert.deepEqual(await fetchPuzzleRowById(GOOD_ROW.id), {
    id: GOOD_ROW.id,
    fen: GOOD_ROW.fen,
    moves: GOOD_ROW.moves,
    rating: GOOD_ROW.rating,
    themes: GOOD_ROW.themes,
  });
  holder.fromImpl = () => eqChain({ data: null, error: null });
  assert.equal(await fetchPuzzleRowById("missing"), null);
  holder.fromImpl = () => eqChain({ data: null, error: new Error("db down") });
  assert.equal(await fetchPuzzleRowById(GOOD_ROW.id), null);
});
