import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameOpenRow } from "./GameOpenRow.tsx";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

let restoreWindowTimers: (() => void) | null = null;

function installFakeWindowTimers() {
  const originalSet = window.setTimeout;
  const originalClear = window.clearTimeout;
  let nextId = 1;
  const scheduled = new Map<number, { fn: () => void; delay: number }>();

  (window as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void, delay = 0) => {
    const id = nextId++;
    scheduled.set(id, { fn, delay });
    return id;
  };
  (window as unknown as { clearTimeout: unknown }).clearTimeout = (id: number) => {
    scheduled.delete(id);
  };

  restoreWindowTimers = () => {
    (window as unknown as { setTimeout: unknown }).setTimeout = originalSet;
    (window as unknown as { clearTimeout: unknown }).clearTimeout = originalClear;
  };

  return {
    delays: () => [...scheduled.values()].map((entry) => entry.delay),
    pendingCount: () => scheduled.size,
    flushAll: () => {
      const entries = [...scheduled.entries()];
      scheduled.clear();
      for (const [, entry] of entries) {
        entry.fn();
      }
    },
  };
}

before(() => setupDom());
afterEach(() => {
  cleanup();
  restoreWindowTimers?.();
  restoreWindowTimers = null;
});
after(() => teardownDom());

function seedPreview(gamePreviewEnabled: boolean) {
  act(() => {
    useStudioStore.setState({
      settings: { ...DEFAULT_SETTINGS, locale: "en", gamePreviewEnabled },
    });
  });
}

test("preview off (from store): single click calls onOpen synchronously and dblclick does not call onOpenNew", () => {
  seedPreview(false);
  const timers = installFakeWindowTimers();
  let openCalls = 0;
  let openNewCalls = 0;

  render(
    <GameOpenRow
      onOpen={() => {
        openCalls += 1;
      }}
      onOpenNew={() => {
        openNewCalls += 1;
      }}
    >
      <span>Game row</span>
    </GameOpenRow>,
  );

  const button = screen.getByRole("button", { name: "Game row" });
  fireEvent.click(button);
  assert.equal(openCalls, 1);
  assert.equal(openNewCalls, 0);
  assert.equal(timers.pendingCount(), 0);

  fireEvent.dblClick(button);
  assert.equal(openCalls, 1);
  assert.equal(openNewCalls, 0);
});

test("preview on (from store): single click waits 250ms and dblclick opens a new board without calling onOpen", () => {
  seedPreview(true);
  const timers = installFakeWindowTimers();
  let openCalls = 0;
  let openNewCalls = 0;

  render(
    <GameOpenRow
      onOpen={() => {
        openCalls += 1;
      }}
      onOpenNew={() => {
        openNewCalls += 1;
      }}
    >
      <span>Game row</span>
    </GameOpenRow>,
  );

  const button = screen.getByRole("button", { name: "Game row" });
  fireEvent.click(button);
  assert.equal(openCalls, 0, "single click must wait 250ms before calling onOpen");
  assert.deepEqual(timers.delays(), [250]);
  timers.flushAll();
  assert.equal(openCalls, 1);

  fireEvent.click(button);
  fireEvent.click(button);
  assert.equal(timers.pendingCount(), 1);
  fireEvent.dblClick(button);
  assert.equal(timers.pendingCount(), 0, "pending single click must be cancelled by double click");
  timers.flushAll();
  assert.equal(openCalls, 1);
  assert.equal(openNewCalls, 1);
});

test("previewEnabled prop overrides store gamePreviewEnabled=false to keep single/double distinction", () => {
  seedPreview(false);
  const timers = installFakeWindowTimers();
  let openCalls = 0;
  let openNewCalls = 0;

  render(
    <GameOpenRow
      previewEnabled
      onOpen={() => {
        openCalls += 1;
      }}
      onOpenNew={() => {
        openNewCalls += 1;
      }}
    >
      <span>File game row</span>
    </GameOpenRow>,
  );

  const button = screen.getByRole("button", { name: "File game row" });
  fireEvent.click(button);
  assert.equal(openCalls, 0);
  assert.deepEqual(timers.delays(), [250]);
  timers.flushAll();
  assert.equal(openCalls, 1);

  fireEvent.click(button);
  fireEvent.dblClick(button);
  assert.equal(timers.pendingCount(), 0);
  timers.flushAll();
  assert.equal(openCalls, 1);
  assert.equal(openNewCalls, 1);
});
