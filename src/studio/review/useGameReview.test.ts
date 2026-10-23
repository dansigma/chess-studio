// SIG-1036: the review uses the user's thread setting, clamped by clampThreads.
import assert from "node:assert/strict";
import test from "node:test";
import { clampThreads, defaultEngineThreads } from "@/src/engine/stockfish-client";
import { reviewThreads } from "./useGameReview.ts";

const g = globalThis as {
  crossOriginIsolated?: boolean;
};

const savedIsolated = g.crossOriginIsolated;
const navDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");

// Emulate a machine/page where the default thread count would be 4:
// COOP/COEP isolation plus 8 hardware threads. Node's global navigator is
// getter-only, so it is overridden via defineProperty and restored after.
function stubThreadedEnv(): void {
  g.crossOriginIsolated = true;
  Object.defineProperty(globalThis, "navigator", {
    value: { hardwareConcurrency: 8 },
    configurable: true,
    writable: true,
  });
}

function restoreEnv(): void {
  if (savedIsolated === undefined) {
    delete g.crossOriginIsolated;
  } else {
    g.crossOriginIsolated = savedIsolated;
  }
  if (navDescriptor) {
    Object.defineProperty(globalThis, "navigator", navDescriptor);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
}

test("reviewThreads honors a lowered user setting (default would be 4)", () => {
  stubThreadedEnv();
  try {
    assert.equal(defaultEngineThreads(), 4);
    assert.equal(reviewThreads(1), 1);
  } finally {
    restoreEnv();
  }
});

test("reviewThreads caps an excessive setting via clampThreads", () => {
  stubThreadedEnv();
  try {
    assert.equal(reviewThreads(99), clampThreads(99));
  } finally {
    restoreEnv();
  }
});

test("reviewThreads leaves the default path unchanged", () => {
  stubThreadedEnv();
  try {
    const fallback = defaultEngineThreads();
    assert.equal(reviewThreads(fallback), Math.max(fallback, fallback));
  } finally {
    restoreEnv();
  }
});
