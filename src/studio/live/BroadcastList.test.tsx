// SIG-1290: broadcasts list sections, states, retry, load more and click → URL.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BroadcastListItem, BroadcastListPage } from "../../lib/live/types.ts";

let calls: number[] = [];
let handler: (page: number) => Promise<BroadcastListPage | null> = async () => {
  throw new Error("unset");
};

/** Like the real client: stays pending, resolves `null` when aborted (so it never wedges the shared queue). */
function pendingUntilAbort(signal: AbortSignal): Promise<null> {
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(null)));
}

class FakeHttpError extends Error {
  constructor(readonly status = 500) {
    super(`HTTP ${status}`);
  }
}
class FakeRateLimited extends FakeHttpError {
  readonly retryAfterMs = 60_000;
  constructor() {
    super(429);
  }
}
mock.module("@/src/lib/live/lichess-broadcast", {
  namedExports: {
    fetchTopBroadcasts: (page: number) => {
      calls.push(page);
      return handler(page);
    },
    LiveRateLimitedError: FakeRateLimited,
    LiveHttpError: FakeHttpError,
    RATE_LIMIT_BACKOFF_MS: 60_000,
    // The round view starts the live manager: a snapshot that never arrives and a stream that idles until aborted.
    fetchRound: (_id: string, signal: AbortSignal) => pendingUntilAbort(signal),
    fetchTour: (_id: string, signal: AbortSignal) => pendingUntilAbort(signal),
    fetchRoundPgn: () => Promise.resolve(null),
    streamRound: (_id: string, _on: unknown, signal: AbortSignal) =>
      new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve())),
  },
});

const { LiveView } = await import("./LiveView.tsx");
const { roundIdForItem, appendUnique } = await import("./use-broadcast-list.ts");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

function item(id: string, extra: Partial<BroadcastListItem> = {}, ongoing = false): BroadcastListItem {
  return {
    tour: {
      id, slug: id, name: `Tour ${id}`, format: "Swiss", timeControl: "90+30", location: "Oslo",
      imageUrl: null, tier: 5, dates: [0, 1], url: "u",
    },
    round: { id: `r-${id}`, slug: "r", name: `Round ${id}`, ongoing, finished: false, startsAt: Date.UTC(2026, 10, 12, 15, 30), url: "u" },
    group: null,
    ...extra,
  };
}
function page(over: Partial<Omit<BroadcastListPage, "past">> & { past?: BroadcastListItem[]; next?: number | null }): BroadcastListPage {
  const next = over.next === undefined ? null : over.next;
  return {
    active: over.active ?? [],
    upcoming: over.upcoming ?? [],
    past: { currentPage: 1, maxPerPage: 20, currentPageResults: over.past ?? [], previousPage: null, nextPage: next },
    nextPage: next,
  };
}

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});
beforeEach(() => {
  cleanup();
  calls = [];
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("http://localhost/studio?view=live");
  act(() => {
    useStudioStore.setState({ workspaceView: "live", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

test("roundIdForItem prefers roundToLink, then round, else null", () => {
  const link = { ...item("a").round!, id: "link" };
  assert.equal(roundIdForItem(item("a", { roundToLink: link })), "link");
  assert.equal(roundIdForItem(item("a")), "r-a");
  assert.equal(roundIdForItem(item("a", { round: null })), null);
});

test("appendUnique skips tours already listed", () => {
  assert.deepEqual(appendUnique([item("a")], [item("a"), item("b")]).map((i) => i.tour.id), ["a", "b"]);
});

test("renders sections in API order; live dot only when ongoing; click sets the URL; Back returns", async () => {
  handler = async () =>
    page({
      active: [item("z", {}, true), item("a", {}, false)],
      upcoming: [item("u")],
      past: [item("p", { roundToLink: { ...item("p").round!, id: "linked" } })],
    });
  render(<LiveView />);
  await screen.findByText("Tour z");
  const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  assert.deepEqual(names, ["Live now", "Upcoming", "Finished"]);
  const active = screen.getByRole("region", { name: "Live now" });
  const order = Array.from(active.querySelectorAll("li")).map((li) => li.textContent);
  assert.match(order[0]!, /Tour z.*Live/u);
  assert.doesNotMatch(order[1]!, /Live/u);
  assert.match(order[1]!, /Round a · Nov 12/u);
  assert.ok(screen.getByText("Powered by Lichess").closest("a")!.getAttribute("href") === "https://lichess.org/broadcast");

  fireEvent.click(screen.getByText("Tour p"));
  assert.equal(window.location.search, "?view=live&live=linked");
  assert.ok(await screen.findByLabelText("Loading round"));
  assert.ok(screen.getByRole("button", { name: "Back to broadcasts" }));
  // happy-dom does not walk session history: emulate the browser Back (previous entry + popstate).
  window.history.back = () => {
    window.history.replaceState(null, "", "/studio?view=live");
    window.dispatchEvent(new window.Event("popstate"));
  };
  fireEvent.click(screen.getByRole("button", { name: "Back to broadcasts" }));
  await waitFor(() => assert.ok(screen.getByText("Tour z")));
});

test("shows the empty state and the error state with retry", async () => {
  handler = async () => {
    throw new Error("boom");
  };
  render(<LiveView />);
  const retry = await screen.findByRole("button", { name: "Try again" });
  handler = async () => page({});
  fireEvent.click(retry);
  await screen.findByText("No broadcasts are live right now.");
  assert.equal(calls.length, 2);
});

test("Load more appends only past items and hides the button when nextPage is null", async () => {
  handler = async (n) =>
    n === 1
      ? page({ past: [item("p1")], next: 2, active: [item("a1", {}, true)] })
      : { ...page({ past: [item("p2")], next: null }), active: [], upcoming: [] };
  render(<LiveView />);
  await screen.findByText("Tour p1");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Tour p2");
  assert.deepEqual(calls, [1, 2]);
  assert.ok(screen.getByText("Tour a1"));
  assert.equal(screen.queryByRole("button", { name: "Load more" }), null);
});
