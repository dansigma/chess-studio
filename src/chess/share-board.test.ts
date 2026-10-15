import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import {
  clearCourseStudyImport,
  fenFromShareSearch,
  readCourseStudyImport,
  shareBoardUrl,
  writeCourseStudyImport,
} from "./share-board.ts";

const E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

test("a share link points at the studio with the position", () => {
  const url = shareBoardUrl("http://localhost:3000", `  ${E4}  `);
  assert.equal(url, `http://localhost:3000/studio?fen=${encodeURIComponent(E4).replaceAll("%20", "+")}`);
  assert.equal(fenFromShareSearch(new URL(url).search), new Chess(E4).fen());
});

test("a bad share link does not open a position", () => {
  assert.equal(fenFromShareSearch(""), null);
  assert.equal(fenFromShareSearch("?fen=not-a-position"), null);
});

function stubSessionStorage(store: Map<string, string>, failing = false) {
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      if (failing) {
        throw new Error("storage unavailable");
      }
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: { sessionStorage: storage },
    configurable: true,
    writable: true,
  });
  return () => {
    // @ts-expect-error cleanup the node:test DOM stub
    delete globalThis.window;
  };
}

test("a course study import round-trips through session storage", () => {
  const store = new Map<string, string>();
  const restore = stubSessionStorage(store);
  try {
    const payload = {
      title: "Caro-Kann — Advance",
      pgn: '[Event "Course"]\n\n1. e4 c6 2. d4 d5 { Main line } *',
      atFen: new Chess().fen(),
    };
    assert.equal(writeCourseStudyImport(payload), true);
    assert.deepEqual(readCourseStudyImport(), payload);
    clearCourseStudyImport();
    assert.equal(readCourseStudyImport(), null);
  } finally {
    restore();
  }
});

test("a malformed course study import reads as null", () => {
  const store = new Map<string, string>([["chess-studio:course-import", "not-json{"]]);
  const restore = stubSessionStorage(store);
  try {
    assert.equal(readCourseStudyImport(), null);
  } finally {
    restore();
  }
});

test("a wrongly shaped course study import reads as null", () => {
  const store = new Map<string, string>([
    ["chess-studio:course-import", JSON.stringify({ title: "", pgn: "1. e4 *" })],
  ]);
  const restore = stubSessionStorage(store);
  try {
    assert.equal(readCourseStudyImport(), null);
  } finally {
    restore();
  }
});

test("a course study import without storage does not throw", () => {
  const store = new Map<string, string>();
  const restore = stubSessionStorage(store, true);
  try {
    assert.equal(
      writeCourseStudyImport({ title: "Course", pgn: "1. e4 *" }),
      false,
    );
  } finally {
    restore();
  }
});
