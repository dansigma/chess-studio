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
};

mock.module("next/navigation", { namedExports: { useRouter: () => ({ push() {} }), usePathname: () => "/puzzles" } });
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
mock.module("./puzzle-client.ts", { namedExports: { loadPuzzleCatalog: async () => [] } });
const realExercises = await import("../lib/mistake-exercises-store.ts");
mock.module("../lib/mistake-exercises-store.ts", {
  namedExports: { ...realExercises, hydrateExercises: async () => ({}) },
});

const { PuzzleDashboard } = await import("./Dashboard.tsx");
const { emptyProgress } = await import("./engine.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  ctl.user = null;
  ctl.fail = false;
  ctl.gate = null;
  ctl.progressCalls = 0;
  ctl.progress = { ...emptyProgress(), rating: 1500, solved: 7, failed: 3 };
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

test("signed out: one sign-in prompt linking to /login, no 'saved in browser' line, real dash for accuracy-less data", async () => {
  ctl.progress = emptyProgress();
  const { container } = render(<PuzzleDashboard />);
  const prompt = await screen.findByTestId("signin-prompt");
  assert.equal(prompt.textContent, "Sign in to keep your progress.");
  assert.equal(prompt.querySelector("a")?.getAttribute("href"), "/login");
  assert.equal(screen.queryByText("Saved in this browser"), null);
  assert.equal(skeletons(container).length, 0);
  assert.equal(container.querySelector("main")?.getAttribute("aria-busy"), "false");
  // accuracy with no attempts is a real "no value"
  assert.ok(screen.getByText("—"));
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
  assert.deepEqual(dd, ["—", "—", "—", "—"]);
  const retry = screen.getByRole("button", { name: "Try again" });
  assert.ok(!retry.className.includes("bg-studio-accent "));

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
