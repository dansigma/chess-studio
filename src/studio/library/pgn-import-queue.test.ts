import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { importOne, splitPgnFiles, type PgnImportDeps } from "./pgn-import-queue";
import { enqueuePgnFiles, resetImportQueue, useImportQueue } from "./import-queue-store";
import type { ParsedFileGame } from "@/src/chess/pgn-games";

afterEach(() => resetImportQueue());

const GAME = '[Event "t"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n\n';
const file = (name: string, text = GAME) => new File([text], name);
const bigFile = (name: string, count: number) => file(name, GAME.repeat(count));

type Recorder = PgnImportDeps & { calls: Array<{ name: string; games: ParsedFileGame[] }>; drained: string[][] };
function makeDeps(existing = 0): Recorder & { onDrained: (ids: string[]) => void } {
  const calls: Recorder["calls"] = [];
  const drained: string[][] = [];
  return {
    calls,
    drained,
    databaseCount: () => existing + calls.length,
    importParsedDatabase: (name, games) => {
      calls.push({ name, games });
      return `id-${name}`;
    },
    onDrained: (ids) => drained.push(ids),
  };
}

test("splits .pgn (case-insensitive) from skipped files", () => {
  const { pgn, skipped } = splitPgnFiles([file("a.pgn"), file("B.PGN"), file("c.txt"), file("d.zip")]);
  assert.deepEqual(pgn.map((f) => f.name), ["a.pgn", "B.PGN"]);
  assert.deepEqual(skipped, ["c.txt", "d.zip"]);
});

test("imports sequentially in order, named without the extension", async () => {
  const deps = makeDeps();
  const { skipped, done } = enqueuePgnFiles([file("one.pgn"), file("Two.PGN"), file("n.txt")], deps);
  await done;
  assert.deepEqual(deps.calls.map((c) => c.name), ["one", "Two"]);
  assert.deepEqual(skipped, ["n.txt"]);
  assert.deepEqual(deps.drained, [["id-one", "id-Two"]]);
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.state), ["done", "done"]);
});

test("only non-pgn files import nothing", async () => {
  const deps = makeDeps();
  const { skipped, done } = enqueuePgnFiles([file("a.txt")], deps);
  await done;
  assert.deepEqual(skipped, ["a.txt"]);
  assert.equal(deps.calls.length, 0);
  assert.deepEqual(useImportQueue.getState().entries, []);
});

test("an unreadable file is marked failed and the rest of the batch still imports", async () => {
  const broken = file("broken.pgn");
  broken.text = () => Promise.reject(new Error("read error"));
  const deps = makeDeps();
  await enqueuePgnFiles([file("a.pgn"), broken, file("c.pgn")], deps).done;
  assert.deepEqual(deps.calls.map((c) => c.name), ["a", "c"]);
  const entries = useImportQueue.getState().entries;
  assert.deepEqual(entries.map((e) => e.state), ["done", "failed", "done"]);
  assert.equal(entries[1].error, "read");
});

test("a file over 5,000 games imports the first 5,000 and reports the rest", async () => {
  const deps = makeDeps();
  await enqueuePgnFiles([bigFile("big.pgn", 5010)], deps).done;
  assert.equal(deps.calls[0].games.length, 5000);
  const [entry] = useImportQueue.getState().entries;
  assert.equal(entry.imported, 5000);
  assert.equal(entry.overLimit, 10);
  assert.equal(entry.unreadable, 0);
});

test("unreadable games are counted separately", async () => {
  const deps = makeDeps();
  await enqueuePgnFiles([file("m.pgn", GAME + '[Event "x"]\n\n*\n\n' + GAME)], deps).done;
  const [entry] = useImportQueue.getState().entries;
  assert.equal(entry.imported, 2);
  assert.equal(entry.unreadable, 1);
  assert.equal(entry.overLimit, 0);
});

test("with 50 databases the file does not start and says why", async () => {
  const deps = makeDeps(50);
  await enqueuePgnFiles([file("a.pgn")], deps).done;
  assert.equal(deps.calls.length, 0);
  const [entry] = useImportQueue.getState().entries;
  assert.equal(entry.state, "failed");
  assert.equal(entry.error, "database-limit");
});

test("49 existing + 3 files: the first imports, the other two hit the limit", async () => {
  const deps = makeDeps(49);
  await enqueuePgnFiles([file("a.pgn"), file("b.pgn"), file("c.pgn")], deps).done;
  assert.deepEqual(deps.calls.map((c) => c.name), ["a"]);
  const entries = useImportQueue.getState().entries;
  assert.deepEqual(entries.map((e) => e.state), ["done", "failed", "failed"]);
  assert.deepEqual(entries.map((e) => e.error), [undefined, "database-limit", "database-limit"]);
});

test("cancelling an importing file saves nothing and the queue moves on", async () => {
  const deps = makeDeps();
  const { done } = enqueuePgnFiles([bigFile("big.pgn", 3000), file("next.pgn")], deps);
  // The first file is importing; cancel it after the first batch reports progress.
  while (useImportQueue.getState().entries[0].done === 0) {
    await new Promise((r) => setTimeout(r, 0));
  }
  useImportQueue.getState().cancel(useImportQueue.getState().entries[0].id);
  await done;
  assert.deepEqual(deps.calls.map((c) => c.name), ["next"]);
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.state), ["cancelled", "done"]);
});

test("cancelling a waiting file removes it from the queue", async () => {
  const deps = makeDeps();
  const { done } = enqueuePgnFiles([bigFile("a.pgn", 200), file("b.pgn"), file("c.pgn")], deps);
  const waiting = useImportQueue.getState().entries.find((e) => e.name === "b.pgn")!;
  useImportQueue.getState().cancel(waiting.id);
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.name), ["a.pgn", "c.pgn"]);
  await done;
  assert.deepEqual(deps.calls.map((c) => c.name), ["a", "c"]);
});

test("dismiss only clears when nothing is waiting or importing", async () => {
  const deps = makeDeps();
  const { done } = enqueuePgnFiles([file("a.pgn")], deps);
  useImportQueue.getState().dismiss();
  assert.equal(useImportQueue.getState().entries.length, 1);
  await done;
  useImportQueue.getState().dismiss();
  assert.deepEqual(useImportQueue.getState().entries, []);
});

test("importOne rejects with AbortError when the signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(importOne(file("a.pgn"), makeDeps(), { signal: controller.signal }), { name: "AbortError" });
});
