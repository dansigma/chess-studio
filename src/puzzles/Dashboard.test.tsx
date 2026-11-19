// SIG-1258: dashboard loading skeletons, load-error retry and the sign-in prompt.
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const ctl = {
  user: null as { id: string } | null,
  fail: false,
  gate: null as Promise<void> | null,
  progress: null as unknown,
  progressCalls: 0,
  pushed: [] as string[],
  catalog: [] as import("./engine.ts").CompiledPuzzle[],
  exercises: {} as import("../lib/mistake-exercises-store.ts").MistakeExercisesMap,
  byId: {} as Record<string, import("./engine.ts").CompiledPuzzle | null>,
  byIdCalls: [] as string[],
  byIdSignals: [] as (AbortSignal | undefined)[],
  byIdGate: null as Promise<void> | null,
  byIdError: null as Error | null,
};

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push: (href: string) => ctl.pushed.push(href) }),
    usePathname: () => "/puzzles",
  },
});
mock.module("../lib/supabase/client.ts", {
  namedExports: {
    createBrowserSupabase: () => ({ auth: { getUser: async () => ({ data: { user: ctl.user } }) } }),
  },
});
const realProgress = await import("./progress.ts");
mock.module("./progress.ts", {
  namedExports: {
    ...realProgress,
    hydratePuzzleProgress: async () => {
      ctl.progressCalls += 1;
      if (ctl.gate) await ctl.gate;
      if (ctl.fail) throw new Error("boom");
      return ctl.progress;
    },
    progressSource: () => (ctl.user ? "account" : "browser"),
  },
});
mock.module("./puzzle-client.ts", {
  namedExports: {
    loadPuzzleCatalog: async () => ctl.catalog,
    loadPuzzleById: async (id: string, options?: { signal?: AbortSignal }) => {
      ctl.byIdCalls.push(id);
      ctl.byIdSignals.push(options?.signal);
      if (ctl.byIdGate) await ctl.byIdGate;
      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (ctl.byIdError) {
        throw ctl.byIdError;
      }
      return ctl.byId[id] ?? null;
    },
  },
});
const realExercises = await import("../lib/mistake-exercises-store.ts");
mock.module("../lib/mistake-exercises-store.ts", {
  namedExports: { ...realExercises, hydrateExercises: async () => ctl.exercises },
});

const { PuzzleDashboard } = await import("./Dashboard.tsx");
const { compilePuzzle, emptyProgress } = await import("./engine.ts");
const { puzzleIdForExercise } = await import("./mistake-puzzle.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  window.sessionStorage.clear();
  ctl.user = null;
  ctl.fail = false;
  ctl.gate = null;
  ctl.progressCalls = 0;
  ctl.progress = { ...emptyProgress(), rating: 1500, solved: 7, failed: 3 };
  ctl.pushed = [];
  ctl.catalog = [];
  ctl.exercises = {};
  ctl.byId = {};
  ctl.byIdCalls = [];
  ctl.byIdSignals = [];
  ctl.byIdGate = null;
  ctl.byIdError = null;
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en" } }));
});

const skeletons = (root: HTMLElement) => root.querySelectorAll(".animate-pulse");

test("loading: skeletons replace the values, hidden from assistive tech, main is aria-busy", () => {
  ctl.gate = new Promise(() => {});
  const { container } = render(<PuzzleDashboard />);
  assert.equal(container.querySelector("main")?.getAttribute("aria-busy"), "true");
  const all = skeletons(container);
  assert.ok(all.length >= 8);
  for (const el of all) assert.equal(el.getAttribute("aria-hidden"), "true");
  assert.ok(container.querySelector(".animate-pulse.bg-studio-hover-strong"));
  assert.equal(screen.queryByText("—"), null);
  assert.equal(screen.queryByTestId("signin-prompt"), null);
  assert.equal(screen.queryByText("Saved in this browser"), null);
});

test("signed out: one sign-in prompt linking to /login, no 'saved in browser' line, no streak panel without activity", async () => {
  ctl.progress = emptyProgress();
  const { container } = render(<PuzzleDashboard />);
  const prompt = await screen.findByTestId("signin-prompt");
  assert.equal(prompt.textContent, "Sign in to keep your progress.");
  assert.equal(prompt.querySelector("a")?.getAttribute("href"), "/login");
  assert.equal(screen.queryByText("Saved in this browser"), null);
  assert.equal(skeletons(container).length, 0);
  assert.equal(container.querySelector("main")?.getAttribute("aria-busy"), "false");
  // SIG-1264: no activity, no streak panel and no wall of zeros
  assert.equal(screen.queryByRole("region", { name: "Monthly progress" }), null);
  assert.equal(container.querySelectorAll("dd").length, 0);
});

test("signed out, pt-BR strings", async () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  render(<PuzzleDashboard />);
  const prompt = await screen.findByTestId("signin-prompt");
  assert.equal(prompt.textContent, "Entre para guardar seu progresso.");
});

test("signed in: shows where progress is saved, no prompt", async () => {
  ctl.user = { id: "u1" };
  const { container } = render(<PuzzleDashboard />);
  await screen.findByText("Saved to your account");
  assert.equal(screen.queryByTestId("signin-prompt"), null);
  assert.equal(screen.getByText("1,500") !== null, true);
  assert.equal(skeletons(container).length, 0);
});

test("error: message and secondary 'Try again', no skeletons, no zeros; retry recovers without reload", async () => {
  ctl.fail = true;
  const { container } = render(<PuzzleDashboard />);
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /Could not load your puzzle progress\./);
  assert.equal(skeletons(container).length, 0);
  assert.equal(screen.queryByTestId("signin-prompt"), null);
  const dd = [...container.querySelectorAll("dd")].map((d) => d.textContent);
  assert.deepEqual(dd, Array(7).fill("—"));
  const retry = screen.getByRole("button", { name: "Try again" });
  assert.ok(!retry.className.includes("bg-studio-accent-solid"));

  ctl.fail = false;
  let release!: () => void;
  ctl.gate = new Promise<void>((r) => (release = r));
  fireEvent.click(retry);
  // retrying: error cleared, loading state shown
  assert.equal(screen.queryByRole("alert"), null);
  assert.ok(skeletons(container).length > 0);
  await act(async () => release());
  await screen.findByTestId("signin-prompt");
  assert.equal(ctl.progressCalls, 2);
  assert.equal(screen.queryByRole("button", { name: "Try again" }), null);
  await waitFor(() => assert.equal(skeletons(container).length, 0));
});

test("error, pt-BR: retry label", async () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  ctl.fail = true;
  render(<PuzzleDashboard />);
  await screen.findByRole("button", { name: "Tentar novamente" });
});

test("a response that arrives after unmount is dropped (no state update, no error)", async () => {
  ctl.fail = true;
  let releaseOld!: () => void;
  ctl.gate = new Promise<void>((r) => (releaseOld = r));
  const { container } = render(<PuzzleDashboard />);
  cleanup();
  await act(async () => releaseOld());
  assert.equal(container.querySelector("[role=alert]"), null);
});

test("SIG-1268: Recent shows saved themes, time and rating; older entries show only what they have", async () => {
  ctl.progress = {
    ...emptyProgress(),
    history: [
      { id: "new", mode: "rated", success: true, at: 9, delta: 7, themes: ["fork", "pin", "mate"], ms: 4200, puzzleRating: 1350 },
      { id: "old", mode: "rated", success: false, at: 3, delta: -5 },
    ],
  };
  const { container } = render(<PuzzleDashboard />);
  const rows = await waitFor(() => {
    const found = container.querySelectorAll("ul > li");
    assert.equal(found.length, 2);
    return found;
  });
  const [fresh, old] = rows;
  assert.ok(fresh?.textContent?.includes("Fork"));
  assert.ok(fresh?.textContent?.includes("Pin"));
  assert.equal(fresh?.textContent?.includes("Mate"), false, "only two themes");
  assert.ok(fresh?.textContent?.includes("4.2s"));
  assert.ok(fresh?.textContent?.includes("1,350"));
  assert.equal(old?.textContent, "Missed-5");
  for (const row of rows) assert.doesNotMatch(row.textContent ?? "", /undefined|NaN/);
});

test("SIG-1412: hero difficulty selector synchronizes with Themes and updates Solve now URL", async () => {
  render(<PuzzleDashboard />);
  await screen.findByTestId("signin-prompt");

  const solveNow = screen.getByRole("button", { name: "Solve now" });
  fireEvent.click(solveNow);
  assert.deepEqual(ctl.pushed, ["/puzzles/play?mode=rated"]);

  // Select Beginner via the hero difficulty radiogroup.
  const heroBeginner = screen.getByRole("radio", { name: "Beginner" });
  fireEvent.click(heroBeginner);
  assert.equal(heroBeginner.getAttribute("aria-checked"), "true");
  assert.equal(screen.getByRole("button", { name: "Beginner" }).getAttribute("aria-pressed"), "true");
  assert.ok(screen.getByTestId("hero-difficulty-unrated"));
  assert.ok(
    screen.getByRole("link", { name: /Fork/ }).getAttribute("href")?.endsWith("difficulty=beginner"),
  );

  fireEvent.click(solveNow);
  assert.equal(ctl.pushed.at(-1), "/puzzles/play?mode=rated&difficulty=beginner");

  // Switching via the Themes difficulty chip updates the hero selector and Solve now URL.
  const themesAdvanced = screen.getByRole("button", { name: "Advanced" });
  fireEvent.click(themesAdvanced);
  assert.equal(screen.getByRole("radio", { name: "Advanced" }).getAttribute("aria-checked"), "true");
  fireEvent.click(solveNow);
  assert.equal(ctl.pushed.at(-1), "/puzzles/play?mode=rated&difficulty=advanced");

  // Clearing back to All resets Solve now to /puzzles/play?mode=rated.
  fireEvent.click(screen.getByRole("radio", { name: "All" }));
  assert.equal(screen.queryByTestId("hero-difficulty-unrated"), null);
  fireEvent.click(solveNow);
  assert.equal(ctl.pushed.at(-1), "/puzzles/play?mode=rated");
});

test("SIG-1412: clicking a Recent row opens catalog, fetched, and mistake puzzles in the Studio", async () => {
  const catalogPuzzle = compilePuzzle({
    id: "queen-corridor",
    fen: "7k/5Qpp/8/8/8/8/6PP/6K1 w - - 0 1",
    moves: ["Qf8#"],
    rating: 750,
    themes: ["mate"],
  });
  const remotePuzzle = compilePuzzle({
    id: "00sHx",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    moves: ["Re8#"],
    rating: 800,
    themes: ["mate"],
  });
  const mistakeKey = "mx:r3k3/8/8/8/8/8/6PP/R5K1 b - -";
  const mistakeId = puzzleIdForExercise(mistakeKey);

  ctl.catalog = [catalogPuzzle];
  ctl.byId = { "00sHx": remotePuzzle };
  ctl.exercises = {
    [mistakeKey]: {
      exercise: {
        key: mistakeKey,
        fen: "r3k3/8/8/8/8/8/6PP/R5K1 b - - 3 17",
        solutionUci: ["a8a1", "g1f2", "a1a2"],
        bestPv: ["Rxa1+", "Kf2", "Ra2+"],
        playedUci: "a8b8",
        label: "blunder",
        phase: "endgame",
        lossCp: 350,
        beforePawns: 0,
        afterPawns: -3.5,
        motif: "win-material",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
      srs: null,
    },
  };
  ctl.progress = {
    ...emptyProgress(),
    history: [
      { id: "queen-corridor", mode: "rated", success: true, at: 30, delta: 8, puzzleRating: 750 },
      { id: "00sHx", mode: "rush", success: false, at: 20, delta: 0, puzzleRating: 800 },
      { id: mistakeId, mode: "mistakes", success: true, at: 10, delta: 0 },
      { id: "missing-id", mode: "rated", success: false, at: 5, delta: -6 },
    ],
  };

  const { container } = render(<PuzzleDashboard />);
  const buttons = await waitFor(() => {
    const found = container.querySelectorAll("ul > li > button");
    assert.equal(found.length, 4);
    return [...found] as HTMLButtonElement[];
  });

  // 1. Catalog puzzle opens immediately without calling loadPuzzleById.
  fireEvent.click(buttons[0]!);
  assert.deepEqual(ctl.byIdCalls, []);
  assert.equal(ctl.pushed.at(-1), "/studio");
  const catalogHandoff = JSON.parse(window.sessionStorage.getItem("chess-studio:course-import") ?? "null");
  assert.equal(catalogHandoff?.title, "Puzzle queen-corridor");
  assert.equal(catalogHandoff?.atFen, catalogPuzzle.fen);

  // 2. Non-cached puzzle fetches via loadPuzzleById and guards against double-clicks while loading.
  let releaseFetch!: () => void;
  ctl.byIdGate = new Promise<void>((resolve) => {
    releaseFetch = resolve;
  });
  fireEvent.click(buttons[1]!);
  fireEvent.click(buttons[1]!);
  assert.deepEqual(ctl.byIdCalls, ["00sHx"]);
  assert.equal(buttons[1]!.disabled, true);
  ctl.byIdGate = null;
  await act(async () => releaseFetch());
  await waitFor(() => assert.equal(ctl.pushed.length, 2));
  const remoteHandoff = JSON.parse(window.sessionStorage.getItem("chess-studio:course-import") ?? "null");
  assert.equal(remoteHandoff?.title, "Puzzle 00sHx");
  assert.match(remoteHandoff?.pgn ?? "", /\[Site "https:\/\/lichess\.org\/training\/00sHx"\]/);

  // 3. Mistake exercise resolves from hydrated exercises with localized mistake title.
  fireEvent.click(buttons[2]!);
  assert.equal(ctl.pushed.length, 3);
  const mistakeHandoff = JSON.parse(window.sessionStorage.getItem("chess-studio:course-import") ?? "null");
  assert.equal(mistakeHandoff?.title, "My mistake");
  assert.equal(mistakeHandoff?.orientation, "black");

  // 4. Missing puzzle shows status message without navigating.
  await act(async () => {
    fireEvent.click(buttons[3]!);
  });
  const status = await screen.findByRole("status");
  assert.equal(status.textContent, "This puzzle is no longer available to open in the Studio.");
  assert.equal(ctl.pushed.length, 3);
});

test("SIG-1412: mobile keeps 5-row cap and >= 44px touch targets on Recent rows and hero difficulty radios", async () => {
  ctl.progress = {
    ...emptyProgress(),
    history: Array.from({ length: 12 }, (_, index) => ({
      id: `p-${index}`,
      mode: "rated" as const,
      success: index % 2 === 0,
      at: 100 - index,
      delta: index % 2 === 0 ? 5 : -5,
    })),
  };

  const { container } = render(<PuzzleDashboard />);
  const items = await waitFor(() => {
    const found = container.querySelectorAll("ul > li");
    assert.equal(found.length, 10);
    return [...found];
  });

  items.forEach((li, index) => {
    assert.equal(li.classList.contains("max-sm:hidden"), index >= 5);
    const btn = li.querySelector("button");
    assert.ok(btn);
    assert.equal(btn.getAttribute("type"), "button");
    assert.ok(btn.className.includes("min-h-11"), "mobile >= 44px touch target");
  });

  for (const radio of screen.getAllByRole("radio")) {
    assert.ok(radio.className.includes("min-h-11"), "hero difficulty radio >= 44px touch target on mobile");
  }
});


test("SIG-1412 follow-up: double-click guard covers cached/mistake rows and last-clicked row wins", async () => {
  const catalogPuzzle = compilePuzzle({
    id: "queen-corridor",
    fen: "7k/5Qpp/8/8/8/8/6PP/6K1 w - - 0 1",
    moves: ["Qf8#"],
    rating: 750,
    themes: ["mate"],
  });
  const remoteA = compilePuzzle({
    id: "00sHa",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    moves: ["Re8#"],
    rating: 800,
    themes: ["mate"],
  });
  const remoteB = compilePuzzle({
    id: "00sHb",
    fen: "7k/5Qpp/8/8/8/8/6PP/6K1 w - - 0 1",
    moves: ["Qf8#"],
    rating: 850,
    themes: ["mate"],
  });
  const mistakeKey = "mx:r3k3/8/8/8/8/8/6PP/R5K1 b - -";
  const mistakeId = puzzleIdForExercise(mistakeKey);

  ctl.catalog = [catalogPuzzle];
  ctl.byId = { "00sHa": remoteA, "00sHb": remoteB };
  ctl.exercises = {
    [mistakeKey]: {
      exercise: {
        key: mistakeKey,
        fen: "r3k3/8/8/8/8/8/6PP/R5K1 b - - 3 17",
        solutionUci: ["a8a1", "g1f2", "a1a2"],
        bestPv: ["Rxa1+", "Kf2", "Ra2+"],
        playedUci: "a8b8",
        label: "blunder",
        phase: "endgame",
        lossCp: 350,
        beforePawns: 0,
        afterPawns: -3.5,
        motif: "win-material",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
      srs: null,
    },
  };
  ctl.progress = {
    ...emptyProgress(),
    history: [
      { id: "queen-corridor", mode: "rated", success: true, at: 40, delta: 8 },
      { id: mistakeId, mode: "mistakes", success: true, at: 30, delta: 0 },
      { id: "00sHa", mode: "rated", success: false, at: 20, delta: -6 },
      { id: "00sHb", mode: "rated", success: true, at: 10, delta: 6 },
    ],
  };

  const { container } = render(<PuzzleDashboard />);
  const buttons = await waitFor(() => {
    const found = container.querySelectorAll("ul > li > button");
    assert.equal(found.length, 4);
    return [...found] as HTMLButtonElement[];
  });

  // Fast double-click on cached row pushes /studio only once.
  fireEvent.click(buttons[0]!);
  fireEvent.click(buttons[0]!);
  assert.equal(ctl.pushed.length, 1);

  // Fast double-click on mistake row pushes /studio only once.
  fireEvent.click(buttons[1]!);
  fireEvent.click(buttons[1]!);
  assert.equal(ctl.pushed.length, 2);

  // Start remote lookup on row A, then click row B before row A settles:
  // row A's AbortSignal is aborted and row B wins without dropping the click.
  let releaseA!: () => void;
  ctl.byIdGate = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  fireEvent.click(buttons[2]!);
  assert.deepEqual(ctl.byIdCalls, ["00sHa"]);
  assert.equal(ctl.byIdSignals[0]?.aborted, false);
  assert.equal(buttons[3]!.disabled, false);

  ctl.byIdGate = null;
  await act(async () => {
    fireEvent.click(buttons[3]!);
  });
  assert.equal(ctl.byIdSignals[0]?.aborted, true);
  await waitFor(() => assert.equal(ctl.pushed.length, 3));
  const handoff = JSON.parse(window.sessionStorage.getItem("chess-studio:course-import") ?? "null");
  assert.equal(handoff?.title, "Puzzle 00sHb");

  // Settling the aborted row A later must not navigate or show an error.
  await act(async () => releaseA());
  assert.equal(ctl.pushed.length, 3);
  assert.equal(screen.queryByRole("status"), null);
});

test("SIG-1412 follow-up: transient lookup failure shows retryable error, allows retry, and unmount aborts in-flight request", async () => {
  const remotePuzzle = compilePuzzle({
    id: "00sHx",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    moves: ["Re8#"],
    rating: 800,
    themes: ["mate"],
  });
  ctl.byId = { "00sHx": remotePuzzle };
  ctl.byIdError = new Error("puzzles API 503");
  ctl.progress = {
    ...emptyProgress(),
    history: [{ id: "00sHx", mode: "rated", success: false, at: 20, delta: -6 }],
  };

  const { container, unmount } = render(<PuzzleDashboard />);
  const rowButton = await waitFor(() => {
    const found = container.querySelector("ul > li > button") as HTMLButtonElement | null;
    assert.ok(found);
    return found;
  });

  // Transient error shows retryable copy instead of permanent-removal copy.
  await act(async () => {
    fireEvent.click(rowButton);
  });
  const status = await screen.findByRole("status");
  assert.equal(status.textContent, "Could not load this puzzle. Try again.");
  assert.equal(rowButton.disabled, false);
  assert.equal(ctl.pushed.length, 0);

  // Clicking the same row again retries and succeeds once the API recovers.
  ctl.byIdError = null;
  let releasePending!: () => void;
  ctl.byIdGate = new Promise<void>((resolve) => {
    releasePending = resolve;
  });
  fireEvent.click(rowButton);
  assert.equal(ctl.byIdCalls.length, 2);
  assert.equal(ctl.byIdSignals[1]?.aborted, false);

  // Unmounting while a lookup is pending aborts the in-flight signal.
  unmount();
  assert.equal(ctl.byIdSignals[1]?.aborted, true);
  releasePending();
});
