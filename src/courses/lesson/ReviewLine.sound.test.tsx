import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Course } from "../types.ts";
import type { DueLine } from "../review-queue.ts";

let soundCount = 0;

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  resume = async () => {};
  createOscillator = () => ({
    type: "triangle",
    frequency: {
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    },
    connect() {},
    start() {
      soundCount += 1;
    },
    stop() {},
  });
  createGain = () => ({
    gain: {
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
    },
    connect() {},
  });
}

const { ReviewLine } = await import("./ReviewLine.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

const COURSE: Course = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "sicilian-review",
  title: "Sicilian",
  summary: "",
  color: "black",
  theme: "openings",
  chapters: [],
  status: "published",
  accessTier: "free",
  priceCents: null,
  level: "beginner",
  language: "en",
  eloMin: null,
  eloMax: null,
  durationMinutes: null,
};

const DUE_LINE: DueLine = {
  chapterId: "c1",
  chapterTitle: "Chapter 1",
  variation: {
    id: "v1",
    title: "Main line",
    pgn: "1. e4 c5 2. Nf3 d6",
  },
  dueAt: "2026-01-01T00:00:00.000Z",
};

before(() => {
  setupDom();
  Object.defineProperty(window, "AudioContext", {
    value: FakeAudioContext,
    configurable: true,
    writable: true,
  });
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  soundCount = 0;
  act(() => {
    useStudioStore.setState({
      settings: { ...DEFAULT_SETTINGS, locale: "en", moveSound: false },
    });
  });
});

test("ReviewLine respects settings.moveSound toggles immediately without remount", () => {
  render(
    <ReviewLine
      locale="en"
      course={COURSE}
      line={DUE_LINE}
      onFinish={() => {}}
      onContinue={() => {}}
    />,
  );

  // Frame 0 is opponent White move (1. e4); Forward plays it without moveSound.
  fireEvent.click(screen.getByRole("button", { name: "Forward" }));
  assert.equal(soundCount, 0);

  // Step back to start, enable moveSound in the store, and step forward again.
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  act(() => {
    useStudioStore.getState().toggleMoveSound();
  });

  fireEvent.click(screen.getByRole("button", { name: "Forward" }));
  assert.equal(soundCount, 1);
});
