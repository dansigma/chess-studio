import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BroadcastManagerDeps } from "@/src/lib/live/broadcast-manager";
import { LIVE_CONNECTION_LABEL_KEYS } from "./live-connection";
import { tLive } from "@/src/i18n/live-strings";
import { deriveLiveRounds, liveSearch, parseLiveUrlState, setLiveManagerDeps, toLiveUrlState, useLiveStore } from "./live-store";

const a1 = { roundId: "A", gameId: "1" };
const a2 = { roundId: "A", gameId: "2" };
const b1 = { roundId: "B", gameId: "1" };

let streams: string[];
let fetches: string[];

function fakeDeps(): BroadcastManagerDeps {
  return {
    fetchRound: async (roundId) => {
      fetches.push(roundId);
      return null;
    },
    streamRound: (roundId, _on, signal) =>
      new Promise<void>((resolve) => {
        streams.push(roundId);
        signal.addEventListener("abort", () => resolve());
      }),
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    now: () => 0,
    visibility: { isHidden: () => false, subscribe: () => () => undefined },
  };
}

beforeEach(() => {
  streams = [];
  fetches = [];
  setLiveManagerDeps(fakeDeps());
  useLiveStore.getState().leaveLive();
});
afterEach(() => {
  useLiveStore.getState().leaveLive();
  setLiveManagerDeps(null);
});

describe("hot rounds", () => {
  it("table round + rounds of open boards; stream follows the focus", () => {
    assert.deepEqual(deriveLiveRounds({ tableRoundId: "T", openBoards: [a1, b1], focusedGame: b1 }), {
      followedRounds: ["T", "A", "B"],
      streamRoundId: "B",
    });
    assert.deepEqual(deriveLiveRounds({ tableRoundId: "T", openBoards: [], focusedGame: null }).streamRoundId, "T");
    assert.deepEqual(deriveLiveRounds({ tableRoundId: null, openBoards: [], focusedGame: null }), { followedRounds: [], streamRoundId: null });
  });

  it("a round is unfollowed once it is neither in the table nor has boards", () => {
    const s = useLiveStore.getState();
    s.setTableRound("T");
    s.openBoard(a1);
    assert.deepEqual(useLiveStore.getState().followedRounds, ["T", "A"]);
    useLiveStore.getState().setTableRound("A");
    assert.deepEqual(useLiveStore.getState().followedRounds, ["A"]);
    useLiveStore.getState().closeBoard(a1);
    assert.deepEqual(useLiveStore.getState().followedRounds, ["A"], "still open in the table");
    useLiveStore.getState().setTableRound(null);
    assert.deepEqual(useLiveStore.getState().followedRounds, []);
  });
});

describe("board set", () => {
  it("open, focus and close keep focusedGame inside openBoards", () => {
    const s = useLiveStore.getState();
    s.openBoard(a1);
    useLiveStore.getState().openBoard(a2, { focus: false });
    assert.deepEqual(useLiveStore.getState().openBoards, [a1, a2]);
    assert.deepEqual(useLiveStore.getState().focusedGame, a1);
    useLiveStore.getState().openBoard(a1); // duplicate
    assert.equal(useLiveStore.getState().openBoards.length, 2);
    useLiveStore.getState().focusBoard(b1); // focusing a closed board opens it
    assert.deepEqual(useLiveStore.getState().openBoards, [a1, a2, b1]);
    useLiveStore.getState().closeBoard(b1);
    assert.deepEqual(useLiveStore.getState().focusedGame, a2);
    useLiveStore.getState().focusBoard(null);
    assert.equal(useLiveStore.getState().focusedGame, null);
  });

  it("one stream for boards of the same round; focus change reopens it for the other round", async () => {
    const s = useLiveStore.getState();
    s.openBoard(a1);
    useLiveStore.getState().openBoard(a2);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(streams, ["A"]);
    useLiveStore.getState().openBoard(b1);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(streams, ["A", "B"]);
  });

  it("leaveLive clears everything", () => {
    useLiveStore.getState().openBoard(a1);
    useLiveStore.getState().leaveLive();
    const s = useLiveStore.getState();
    assert.deepEqual([s.openBoards, s.followedRounds, s.focusedGame, s.connection], [[], [], null, "idle"]);
  });
});

describe("URL sync", () => {
  it("applyLiveUrlState(parseLiveUrlState(url)) round-trips through withLiveUrlState", () => {
    const search = "?view=live&live=T&games=A:1,A:2,B:1&focus=A:2";
    useLiveStore.getState().applyLiveUrlState(parseLiveUrlState(search));
    const s = useLiveStore.getState();
    assert.equal(s.tableRoundId, "T");
    assert.deepEqual(s.openBoards, [a1, a2, b1]);
    assert.deepEqual(s.focusedGame, a2);
    assert.deepEqual(parseLiveUrlState(liveSearch("", s)), toLiveUrlState(s));
    assert.deepEqual(parseLiveUrlState(liveSearch("", s)), parseLiveUrlState(search));
  });

  it("a focus missing from games is added to the boards", () => {
    useLiveStore.getState().applyLiveUrlState({ round: null, games: [a1], focus: b1 });
    assert.deepEqual(useLiveStore.getState().openBoards, [a1, b1]);
  });
});

describe("ingest", () => {
  it("stream update then older snapshot keeps the stream's board and the snapshot's federation", () => {
    const p = { name: "A", title: null, rating: null, fideId: null };
    const fen = (m: number) => `8/8/8/8/8/8/8/8 w - - 0 ${m}`;
    useLiveStore.getState().ingestUpdate({ id: "g", roundId: "r", pgn: "p", fen: fen(20), lastMoveUci: null, result: "*", white: p, black: p, whiteClockMs: null, blackClockMs: null });
    const lp = { name: "A", title: "GM", rating: 2700, fed: "FRA", fideId: 1, clockMs: null };
    useLiveStore.getState().ingestSnapshot({
      tour: {} as never,
      round: { id: "r" } as never,
      group: null,
      defaultRoundId: null,
      games: [{ id: "g", roundId: "r", white: lp, black: lp, fen: fen(19), lastMoveUci: null, result: "*", thinkTimeSec: 3, pgn: null, updatedAt: 0 }],
    });
    const g = useLiveStore.getState().gamesByRound.r.g;
    assert.equal(g.fen, fen(20));
    assert.equal(g.white.fed, "FRA");
  });
});

describe("indicator labels", () => {
  it("every connection state has an en and pt-BR label (no literals)", () => {
    for (const key of Object.values(LIVE_CONNECTION_LABEL_KEYS)) {
      assert.ok(tLive("en", key).length > 0);
      assert.notEqual(tLive("pt-br", key), "");
    }
    assert.equal(tLive("pt-br", "live.connection.live"), "Ao vivo");
    assert.equal(tLive("pt-br", "live.connection.rate-limited"), "Limite do Lichess, aguarde");
  });
});
