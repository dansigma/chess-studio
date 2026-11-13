import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { importOne, splitPgnFiles, type PgnImportDeps } from "./pgn-import-queue";
import { enqueuePgnFiles, resetImportQueue, useImportQueue } from "./import-queue-store";
import type { ParsedFileGame } from "@/src/chess/pgn-games";

const stops: Array<() => void> = [];
afterEach(() => {
  resetImportQueue();
  for (const stop of stops.splice(0)) {
    stop();
  }
});

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
    databases: () => [],
    replaceDatabaseGames: () => false,
    resolveConflict: async () => "cancel",
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

// --- SIG-1324: name conflicts ---
const g = (move: string) => `[Event "t"]\n[White "A"]\n[Black "B"]\n[Date "2020.01.01"]\n[Result "1-0"]\n\n1. e4 e5 2. ${move} 1-0\n\n`;
const parsedGame = (id: string, move: string): ParsedFileGame => ({
  id,
  white: "A",
  black: "B",
  result: "1-0",
  event: "t",
  date: "2020.01.01",
  pgn: g(move),
  title: "",
});

function conflictDeps(existingNames: string[], choice: "replace" | "keep-both" | "merge" | "cancel" | null, total = existingNames.length) {
  const dbs = existingNames.map((name, i) => ({
    id: `db${i}`,
    remoteId: null,
    name,
    folderId: null,
    games: [parsedGame(`g${i}`, "Nf3")],
  }));
  const replaced: Array<{ id: string; games: ParsedFileGame[] }> = [];
  const asked: Array<{ name: string; keepBothAllowed: boolean }> = [];
  const deps = {
    ...makeDeps(),
    databaseCount: () => total + (deps?.calls.length ?? 0),
    databases: () => [...dbs, ...(deps?.calls ?? []).map((c) => ({ id: `id-${c.name}`, remoteId: null, name: c.name, folderId: null, games: c.games }))],
    replaceDatabaseGames: (id: string, games: ParsedFileGame[]) => {
      replaced.push({ id, games });
      return true;
    },
  };
  // The queue store owns the dialog state; answer it like the dialog buttons do.
  const stop = useImportQueue.subscribe((state) => {
    if (state.pendingConflict) {
      asked.push({ name: state.pendingConflict.databaseName, keepBothAllowed: state.pendingConflict.keepBothAllowed });
      if (choice) {
        queueMicrotask(() => state.answerConflict(choice));
      }
    }
  });
  stops.push(stop);
  return Object.assign(deps, { replaced, asked });
}

test("no dialog when the name does not match", async () => {
  const deps = conflictDeps(["Other"], "replace");
  await enqueuePgnFiles([file("New.pgn")], deps).done;
  assert.equal(deps.asked.length, 0);
  assert.deepEqual(deps.calls.map((c) => c.name), ["New"]);
});

test("a name match (case, spaces) asks and Replace keeps the database id", async () => {
  const deps = conflictDeps(["Sicilian"], "replace");
  await enqueuePgnFiles([file("sicilian.PGN", g("Nc3") + g("Bc4"))], deps).done;
  assert.deepEqual(deps.asked, [{ name: "Sicilian", keepBothAllowed: true }]);
  assert.equal(deps.calls.length, 0);
  assert.equal(deps.replaced[0].id, "db0");
  assert.equal(deps.replaced[0].games.length, 2);
  assert.deepEqual(deps.drained, [["db0"]]);
  const [entry] = useImportQueue.getState().entries;
  assert.equal(entry.state, "done");
  assert.equal(entry.mode, "replace");
  assert.equal(entry.imported, 2);
});

test("Keep both imports as 'name (2)', then (3)", async () => {
  const deps = conflictDeps(["Sicilian", "Sicilian (2)"], "keep-both");
  await enqueuePgnFiles([file("Sicilian.pgn")], deps).done;
  assert.deepEqual(deps.calls.map((c) => c.name), ["Sicilian (3)"]);
  assert.equal(deps.replaced.length, 0);
});

test("Merge adds only new games and reports added and duplicates", async () => {
  const deps = conflictDeps(["Sicilian"], "merge");
  await enqueuePgnFiles([file("Sicilian.pgn", g("Nf3") + g("Nc3"))], deps).done;
  assert.equal(deps.replaced[0].id, "db0");
  assert.equal(deps.replaced[0].games.length, 2);
  const [entry] = useImportQueue.getState().entries;
  assert.equal(entry.mode, "merge");
  assert.equal(entry.added, 1);
  assert.equal(entry.duplicates, 1);
  assert.equal(entry.overLimit, 0);
});

test("Cancel skips only that file and the queue continues", async () => {
  const deps = conflictDeps(["Sicilian"], "cancel");
  await enqueuePgnFiles([file("Sicilian.pgn"), file("Other.pgn")], deps).done;
  assert.deepEqual(deps.calls.map((c) => c.name), ["Other"]);
  assert.equal(deps.replaced.length, 0);
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.state), ["cancelled", "done"]);
});

test("the queue waits on the dialog answer, and the widget cancel closes it", async () => {
  const deps = conflictDeps(["Sicilian"], null);
  const { done } = enqueuePgnFiles([file("Sicilian.pgn"), file("Other.pgn")], deps);
  while (!useImportQueue.getState().pendingConflict) {
    await new Promise((r) => setTimeout(r, 0));
  }
  const pending = useImportQueue.getState().pendingConflict!;
  assert.equal(pending.databaseName, "Sicilian");
  assert.equal(useImportQueue.getState().entries[0].state, "awaiting");
  assert.equal(deps.calls.length, 0);
  useImportQueue.getState().cancel(pending.entryId);
  await done;
  assert.equal(useImportQueue.getState().pendingConflict, null);
  assert.deepEqual(deps.calls.map((c) => c.name), ["Other"]);
  assert.deepEqual(useImportQueue.getState().entries.map((e) => e.state), ["cancelled", "done"]);
});

test("at 50 databases a name match still asks; Keep both is blocked, Replace and Merge work", async () => {
  const names = Array.from({ length: 50 }, (_, i) => (i === 0 ? "Sicilian" : `db ${i}`));
  const blocked = conflictDeps(names, "keep-both");
  await enqueuePgnFiles([file("Sicilian.pgn")], blocked).done;
  assert.deepEqual(blocked.asked, [{ name: "Sicilian", keepBothAllowed: false }]);
  assert.equal(blocked.calls.length, 0);
  assert.equal(useImportQueue.getState().entries[0].error, "database-limit");

  resetImportQueue();
  for (const stop of stops.splice(0)) stop();
  const replace = conflictDeps(names, "replace");
  await enqueuePgnFiles([file("Sicilian.pgn")], replace).done;
  assert.equal(replace.replaced.length, 1);
  resetImportQueue();
  for (const stop of stops.splice(0)) stop();
  const merge = conflictDeps(names, "merge");
  await enqueuePgnFiles([file("Sicilian.pgn", g("Nc3"))], merge).done;
  assert.equal(merge.replaced.length, 1);
  // A non-matching file at 50 is still refused without prompting.
  resetImportQueue();
  for (const stop of stops.splice(0)) stop();
  const other = conflictDeps(names, "replace");
  await enqueuePgnFiles([file("Fresh.pgn")], other).done;
  assert.equal(other.asked.length, 0);
  assert.equal(useImportQueue.getState().entries[0].error, "database-limit");
});

test("Merge counts new games past the 5,000 limit", async () => {
  const deps = conflictDeps(["Sicilian"], "merge");
  const many = Array.from({ length: 5010 }, (_, i) => `[White "P${i}"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n\n`).join("");
  await enqueuePgnFiles([file("Sicilian.pgn", many)], deps).done;
  assert.equal(deps.replaced[0].games.length, 5000);
  const [entry] = useImportQueue.getState().entries;
  assert.equal(entry.added, 4999);
  assert.equal(entry.overLimit, 10 + 1);
});
