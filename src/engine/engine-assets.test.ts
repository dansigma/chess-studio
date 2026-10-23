import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

// `public/engine/full/stockfish.worker.js` is byte-identical to
// `public/engine/full/stockfish-19.js`, so it looks like a leftover
// duplicate. It is not: the threaded build spawns its pthread workers with
// `V("stockfish.worker.js")` (see `stockfish-19.js`), loading that file by
// name from the same directory. Deleting it breaks multithreaded analysis.
const workerUrl = new URL(
  "../../public/engine/full/stockfish.worker.js",
  import.meta.url,
);
const threadedUrl = new URL(
  "../../public/engine/full/stockfish-19.js",
  import.meta.url,
);

describe("engine assets", () => {
  it("keeps stockfish.worker.js next to the threaded build", () => {
    assert.ok(
      existsSync(workerUrl),
      "public/engine/full/stockfish.worker.js is missing: the threaded build " +
        "stockfish-19.js spawns its pthread workers via V(\"stockfish.worker.js\"), " +
        "so the file must stay next to it even though it looks like a duplicate",
    );
  });

  it("keeps the threaded build referencing stockfish.worker.js by name", () => {
    const threadedSource = readFileSync(threadedUrl, "utf8");
    assert.ok(
      threadedSource.includes("stockfish.worker.js"),
      "public/engine/full/stockfish-19.js no longer references stockfish.worker.js: " +
        "update this guard and the README engine section together",
    );
  });
});
