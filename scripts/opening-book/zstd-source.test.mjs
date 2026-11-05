// scripts/opening-book/zstd-source.test.mjs
// SIG-1227: a decompressor that fails must fail the build (nothing written),
// the pipe is read with backpressure and no data loss, and a cut-off or too
// small input is reported.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { buildBook, run, zstdLines } from "./build-book.mjs";
import { linesOf } from "./pgn.mjs";
import { TEN_MOVES, many, otb, pgn, source } from "./test-helpers.mjs";

/** `command` hook that runs `node -e <script>` instead of zstd. */
const fake = (script) => () => ({ command: process.execPath, args: ["-e", script, "--"] });
const GAMES = many(150, (i) => pgn(TEN_MOVES, { Site: `https://lichess.org/g${i}` }));

function workdir() {
  const dir = mkdtempSync(join(tmpdir(), "book-test-"));
  const input = join(dir, "lichess_db_standard_rated_2026-05.pgn.zst");
  writeFileSync(input, "not really zstd");
  return { dir, input, out: join(dir, "out"), app: join(dir, "manifest.ts") };
}

const emit = (text) => `process.stdout.write(${JSON.stringify(text)});`;

describe("a failing decompressor fails the build (SIG-1227)", () => {
  it("non-zero exit mid-stream: clear error, no book, no manifest, app manifest untouched", async () => {
    const { input, out, app } = workdir();
    writeFileSync(app, "// sentinel\n");
    const script = `${emit(GAMES.slice(0, 1200))} process.stderr.write("zstd: error 70 : Write error : cannot write block : No space left on device"); process.exit(70);`;
    await assert.rejects(
      run([input, "--out-dir", out, "--version", "3", "--app-manifest", app], { command: fake(script) }),
      (error) => {
        assert.match(error.message, /exited with code 70/);
        assert.match(error.message, /No space left on device/);
        assert.match(error.message, /no book written/);
        return true;
      },
    );
    assert.equal(existsSync(out), false, "no output directory, so no book and no manifest");
    assert.equal(readFileSync(app, "utf8"), "// sentinel\n", "--app-manifest not rewritten");
  });

  it("killed by a signal", async () => {
    const { input, out } = workdir();
    const script = `${emit(GAMES.slice(0, 800))} setTimeout(() => process.kill(process.pid, "SIGKILL"), 20);`;
    await assert.rejects(run([input, "--out-dir", out, "--version", "3"], { command: fake(script) }), /killed by SIGKILL/);
    assert.equal(existsSync(out), false);
  });

  it("a decompressor that cannot be started", async () => {
    const { input, out } = workdir();
    await assert.rejects(
      run([input, "--out-dir", out, "--version", "3"], { command: () => ({ command: "definitely-not-a-real-zstd-binary", args: [] }) }),
      /could not run definitely-not-a-real-zstd-binary/,
    );
    assert.equal(existsSync(out), false);
  });

  it("a decompressor that finishes cleanly builds the book", async () => {
    const { input, out, app } = workdir();
    const result = await run([input, "--out-dir", out, "--version", "3", "--app-manifest", app], { command: fake(emit(GAMES)) });
    assert.equal(result.stats.read, 150);
    assert.equal(result.manifest.games, 150);
    assert.deepEqual(result.manifest.months, ["2026-05"]);
    assert.ok(existsSync(join(out, "opening-book-v3.bin.gz")));
    assert.ok(existsSync(join(out, "opening-book-v3.manifest.json")));
    assert.match(readFileSync(app, "utf8"), /OPENING_BOOK_MANIFEST/);
  });

  it("closing the reader early (--max-games) stops the child without an error", async () => {
    const { input, out } = workdir();
    const endless = `const line = ${JSON.stringify(GAMES.slice(0, 600))}; const go = () => { while (process.stdout.write(line)) {} }; process.stdout.on("drain", go); go();`;
    const result = await run([input, "--out-dir", out, "--version", "3", "--max-games", "20"], { command: fake(endless) });
    assert.equal(result.stats.kept, 20);
  });

  it("a missing input file is reported before anything runs", async () => {
    await assert.rejects(run(["nope.pgn.zst", "--out-dir", join(tmpdir(), "x"), "--version", "1"]), /input not found/);
  });
});

describe("backpressure", () => {
  it("a slow consumer pauses the producer: bounded buffering, every line delivered exactly once", async () => {
    const total = 30_000;
    let produced = 0;
    let maxBuffered = 0;
    const stream = new Readable({
      highWaterMark: 4096,
      read() {
        // 25 lines per chunk
        let chunk = "";
        for (let i = 0; i < 25 && produced < total; i += 1) {
          chunk += `line ${produced}\n`;
          produced += 1;
        }
        maxBuffered = Math.max(maxBuffered, this.readableLength);
        this.push(chunk === "" ? null : chunk);
      },
    });
    let received = 0;
    let maxLead = 0;
    for await (const line of linesOf(stream)) {
      assert.equal(line, `line ${received}`);
      received += 1;
      maxLead = Math.max(maxLead, produced - received);
      if (received % 200 === 0) {
        await new Promise((resolve) => setImmediate(resolve)); // slow consumer
      }
    }
    assert.equal(received, total);
    assert.ok(maxBuffered <= 4096 + 400, `readable buffer stayed bounded (${maxBuffered})`);
    assert.ok(maxLead < 2000, `producer never ran far ahead of the consumer (${maxLead} lines)`);
  });

  it("a real child process streaming megabytes into a slow consumer loses nothing and exits 0", async () => {
    const lines = 120_000;
    const script = `let i = 0; const go = () => { while (i < ${lines}) { const ok = process.stdout.write("this is line number " + i + " of the stream\\n"); i += 1; if (!ok) { process.stdout.once("drain", go); return; } } }; go();`;
    const hash = createHash("sha256");
    let count = 0;
    for await (const line of zstdLines("ignored", { command: fake(script) })) {
      hash.update(`${line}\n`);
      count += 1;
      if (count % 5000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 2)); // the consumer is busy counting
      }
    }
    const expected = createHash("sha256");
    for (let i = 0; i < lines; i += 1) {
      expected.update(`this is line number ${i} of the stream\n`);
    }
    assert.equal(count, lines);
    assert.equal(hash.digest("hex"), expected.digest("hex"));
  });

  it("multi-byte characters split across chunks survive", async () => {
    const bytes = Buffer.from("[White \"Müller, Jörg\"]\nnext Ø\n");
    const stream = Readable.from([bytes.subarray(0, 11), bytes.subarray(11, 12), bytes.subarray(12)]);
    const lines = [];
    for await (const line of linesOf(stream)) {
      lines.push(line);
    }
    assert.deepEqual(lines, ['[White "Müller, Jörg"]', "next Ø"]);
  });

  it("a UTF-8 byte order mark at the start of the file is dropped", async () => {
    const lines = [];
    for await (const line of linesOf(Readable.from(["﻿[Event \"x\"]\n"]))) {
      lines.push(line);
    }
    assert.deepEqual(lines, ['[Event "x"]']);
  });
});

describe("input sanity", () => {
  it("warns when the stream ends in the middle of a game (stdin cut short)", async () => {
    const whole = GAMES;
    const cut = whole.slice(0, whole.length - 60); // lose the end of the last game
    const warned = await buildBook([source(cut)], { version: 1, maxPly: 40, sourceNames: ["stdin"] });
    assert.ok(warned.warnings.some((warning) => /stdin ended in the middle of a game/.test(warning)), warned.warnings.join("|"));
    const headersOnly = await buildBook([source(`${whole}[Event "cut"]\n[White "A"]\n`)], { version: 1, maxPly: 40, sourceNames: ["stdin"] });
    assert.equal(headersOnly.warnings.length, 1);
    const fine = await buildBook([source(whole)], { version: 1, maxPly: 40, sourceNames: ["stdin"] });
    assert.deepEqual(fine.warnings, []);
  });

  it("--min-games-read aborts a build that read too little, writing nothing", async () => {
    const { input, out } = workdir();
    await assert.rejects(
      run([input, "--out-dir", out, "--version", "3", "--min-games-read", "1000"], { command: fake(emit(GAMES)) }),
      /read only 150 games, below --min-games-read 1000/,
    );
    assert.equal(existsSync(out), false);
    const ok = await run([input, "--out-dir", out, "--version", "3", "--min-games-read", "150"], { command: fake(emit(GAMES)) });
    assert.equal(ok.stats.read, 150);
  });

  it("with --months, warns when far fewer games than a Lichess month were read", async () => {
    const small = await buildBook([source(GAMES)], { version: 1, maxPly: 40, months: ["2026-05"] });
    assert.ok(small.warnings.some((warning) => /a Lichess month has about 90000000/.test(warning)), small.warnings.join("|"));
    const trial = await buildBook([source(GAMES)], { version: 1, maxPly: 40, months: ["2026-05"], maxGames: 100 });
    assert.deepEqual(trial.warnings, [], "a --max-games trial run is not a full month");
    const masters = await buildBook([source(many(3, () => otb(TEN_MOVES)))], { profile: "masters", version: 1, maxPly: 40, months: ["2026-05"] });
    assert.deepEqual(masters.warnings, [], "no expected size for masters databases");
    const none = await buildBook([source(GAMES)], { version: 1, maxPly: 40 });
    assert.deepEqual(none.warnings, [], "no months, nothing to compare with");
  });
});

describe("spawn wiring", () => {
  it("zstdLines passes -dc --long=31 and the file name by default", async () => {
    let seen;
    const spawnImpl = (command, args, options) => {
      seen = { command, args, options };
      return spawn(process.execPath, ["-e", "process.stdout.write('[Event \"x\"]\\n')"], options);
    };
    for await (const line of zstdLines("dump.pgn.zst", { spawnImpl })) {
      assert.equal(line, '[Event "x"]');
    }
    assert.equal(seen.command, "zstd");
    assert.deepEqual(seen.args, ["-dc", "--long=31", "dump.pgn.zst"]);
  });
});
