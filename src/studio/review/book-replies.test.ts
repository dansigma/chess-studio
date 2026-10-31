// SIG-1087: fetchBookReplies abort + unchanged sequential behavior.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { GameTree, VariationPoint } from "@/src/chess/tree";
import { fetchBookReplies } from "./book-replies.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function makeLine(): { tree: GameTree; points: VariationPoint[] } {
  const node = (id: string, san: string, uci: string, fen: string, children: GameTree["children"] = []) => ({
    id,
    san,
    uci,
    fen,
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    children,
  });
  const tree: GameTree = {
    startFen: START_FEN,
    children: [
      node("n1", "e4", "e2e4", "fen-1", [
        node("n2", "e5", "e7e5", "fen-2", [node("n3", "Nf3", "g1f3", "fen-3")]),
      ]),
    ],
  };
  const points: VariationPoint[] = [
    { path: [], fen: START_FEN, san: null },
    { path: [0], fen: "fen-1", san: "e4" },
    { path: [0, 0], fen: "fen-2", san: "e5" },
    { path: [0, 0, 0], fen: "fen-3", san: "Nf3" },
  ];
  return { tree, points };
}

type StubFetch = {
  calls: Array<{ url: string; signal?: AbortSignal }>;
  impl: (url: string, init?: { signal?: AbortSignal }) => Promise<unknown>;
};

function stubFetch(impl: StubFetch["impl"]): StubFetch {
  const stub: StubFetch = { calls: [], impl };
  (globalThis as Record<string, unknown>).fetch = (async (url: string, init?: { signal?: AbortSignal }) => {
    stub.calls.push({ url, signal: init?.signal });
    return stub.impl(url, init);
  }) as never;
  return stub;
}

const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");

afterEach(() => {
  if (fetchDescriptor) {
    Object.defineProperty(globalThis, "fetch", fetchDescriptor);
  } else {
    delete (globalThis as Record<string, unknown>).fetch;
  }
});

function okReplies(ucis: string[]): unknown {
  return {
    ok: true,
    json: async () => ({ moves: ucis.map((uci) => ({ uci })) }),
  };
}

test("stops at the first move that leaves the book", async () => {
  const { tree, points } = makeLine();
  const payloads = [["e2e4", "d2d4"], ["a7a6"]];
  const stub = stubFetch(async () => okReplies(payloads.shift() ?? []));
  const replies = await fetchBookReplies(tree, points, () => false);
  assert.deepEqual(replies, [
    ["e2e4", "d2d4"],
    ["a7a6"],
  ]);
  assert.equal(stub.calls.length, 2);
});

test("pushes null and stops on a non-OK response", async () => {
  const { tree, points } = makeLine();
  const stub = stubFetch(async () => ({ ok: false }));
  const replies = await fetchBookReplies(tree, points, () => false);
  assert.deepEqual(replies, [null]);
  assert.equal(stub.calls.length, 1);
});

test("returns empty without fetching when already cancelled", async () => {
  const { tree, points } = makeLine();
  const stub = stubFetch(async () => okReplies(["e2e4"]));
  const replies = await fetchBookReplies(tree, points, () => true);
  assert.deepEqual(replies, []);
  assert.equal(stub.calls.length, 0);
});

test("aborting mid-request returns partial replies without a null sentinel", async () => {
  const { tree, points } = makeLine();
  let resolveFirst!: (value: unknown) => void;
  const first = new Promise<unknown>((resolve) => {
    resolveFirst = resolve;
  });
  const stub = stubFetch((url, init) => {
    if (stub.calls.length === 1) {
      return first.then(() => {
        if (init?.signal?.aborted) {
          throw new DOMException("The operation was aborted.", "AbortError");
        }
        return okReplies(["e2e4", "d2d4"]);
      });
    }
    return new Promise<never>((_, reject) => {
      if (init?.signal?.aborted) {
        reject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      init?.signal?.addEventListener(
        "abort",
        () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        },
        { once: true },
      );
    });
  });
  const controller = new AbortController();
  const pending = fetchBookReplies(tree, points, () => controller.signal.aborted, controller.signal);
  // Settle the first request so the loop advances to the hanging second one.
  resolveFirst(undefined);
  for (let attempt = 0; attempt < 100 && stub.calls.length < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  // The loop must have issued the second request and be awaiting it.
  assert.equal(stub.calls.length, 2);
  controller.abort();
  const replies = await pending;
  assert.deepEqual(replies, [["e2e4", "d2d4"]]);
  assert.equal(stub.calls[1].signal?.aborted, true);
});

test("non-abort network failure pushes null and stops", async () => {
  const { tree, points } = makeLine();
  const stub = stubFetch(async () => {
    throw new Error("boom");
  });
  const replies = await fetchBookReplies(tree, points, () => false);
  assert.deepEqual(replies, [null]);
  assert.equal(stub.calls.length, 1);
});
