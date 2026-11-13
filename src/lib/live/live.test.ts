import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { importPgn } from "../../chess/pgn.ts";
import {
  LiveHttpError,
  LiveRateLimitedError,
  fetchRound,
  fetchRoundPgn,
  fetchTopBroadcasts,
  fetchTour,
  mapBroadcastRound,
  mapBroadcastTop,
  mapBroadcastTour,
  streamRound,
} from "./lichess-broadcast.ts";
import { lastUrlSegment, normalizeResult, parseGame } from "./parse-game.ts";
import { createPgnStreamSplitter } from "./pgn-stream.ts";
import type { LiveGameUpdate } from "./types.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const json = (name: string): unknown => JSON.parse(fixture(name));

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    return handler(String(input), init);
  }) as typeof fetch;
  return calls;
}

function streamingResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status },
  );
}

describe("list / tour / round mapping", () => {
  it("maps /api/broadcast/top with the past paginator and roundToLink", () => {
    const page = mapBroadcastTop(json("top.json"));
    assert.ok(page.active.length >= 1);
    const [item] = page.active;
    assert.equal(item?.tour.id, "wLrwkC0C");
    assert.equal(item?.tour.format, "6-player double round-robin");
    assert.equal(item?.tour.timeControl, "45 min + 30 sec / move");
    assert.equal(item?.tour.location, "Budapest, Hungary");
    assert.equal(item?.tour.tier, 5);
    assert.deepEqual(item?.tour.dates, [1794405600000, 1794763800000]);
    assert.deepEqual(mapBroadcastTour({ tour: { dates: [5] } }).tour.dates, [5, 5]);
    assert.equal(item?.round?.id, "djmeJZUw");
    assert.equal(item?.round?.ongoing, true);
    assert.equal(item?.group, "Total Chess World Championship Tour Pilot 2026");
    assert.equal(item?.roundToLink, undefined);
    assert.equal(page.past.currentPage, 1);
    assert.equal(page.past.maxPerPage, 24);
    assert.equal(page.past.previousPage, null);
    assert.equal(page.past.nextPage, 2);
    assert.equal(page.nextPage, 2);
    const linked = [...page.active, ...page.past.currentPageResults].find((i) => i.roundToLink);
    assert.ok(linked?.roundToLink);
    assert.match(linked.roundToLink.url, /^https:\/\/lichess\.org\/broadcast\/.+\/round-\d+\/\w+$/);
  });

  it("caps past pagination at page 20 and tolerates empty pages", () => {
    const capped = mapBroadcastTop({ past: { currentPage: 20, maxPerPage: 24, currentPageResults: [], previousPage: 19, nextPage: 21 } });
    assert.equal(capped.nextPage, null);
    assert.equal(capped.past.nextPage, null);
    assert.deepEqual(capped.active, []);
    assert.deepEqual(capped.upcoming, []);
  });

  it("maps a tour with rounds, group and defaultRoundId", () => {
    const tour = mapBroadcastTour(json("tour.json"));
    assert.equal(tour.tour.id, "wLrwkC0C");
    assert.equal(tour.rounds[0]?.finished, true);
    assert.equal(tour.rounds.at(-1)?.ongoing, false);
    assert.equal(tour.defaultRoundId, "djmeJZUw");
    assert.equal(tour.group?.id, "uMS8kYeS");
    assert.equal(tour.group?.tours[0]?.live, true);
  });

  it("maps a round: centiseconds to ms, UCI last move, normalized result", () => {
    const snapshot = mapBroadcastRound(json("round.json"), 123);
    assert.equal(snapshot.round.id, "djmeJZUw");
    assert.equal(snapshot.group?.name, "Total Chess World Championship Tour Pilot 2026");
    const [first, second] = snapshot.games;
    assert.equal(first?.roundId, "djmeJZUw");
    assert.equal(first?.lastMoveUci, "d5d7");
    assert.equal(first?.thinkTimeSec, 77);
    assert.equal(first?.updatedAt, 123);
    assert.equal(first?.white.name, "Abdusattorov, Nodirbek");
    assert.equal(first?.white.fed, "UZB");
    assert.equal(first?.white.clockMs, 375_000);
    assert.equal(second?.white.clockMs, 1_474_000);
    assert.equal(second?.black.clockMs, 1_416_000);
    assert.ok(snapshot.games.some((g) => g.result === "1/2-1/2"));
    assert.equal(normalizeResult("½-½"), "1/2-1/2");
  });
});

describe("stream splitter", () => {
  const text = fixture("stream.pgn");

  it("splits whole text into games", () => {
    const splitter = createPgnStreamSplitter();
    const games = [...splitter.push(text), ...splitter.flush()];
    assert.equal(games.length, 4);
    for (const game of games) {
      assert.ok(game.startsWith("[Event "));
    }
  });

  it("gives the same games for any chunking, including cuts in a tag, a move and a CRLF", () => {
    const whole = createPgnStreamSplitter();
    const reference = [...whole.push(text), ...whole.flush()];
    for (const size of [1, 7, 64, 333]) {
      for (const input of [text, text.replace(/\n/g, "\r\n")]) {
        const splitter = createPgnStreamSplitter();
        const out: string[] = [];
        for (let i = 0; i < input.length; i += size) {
          out.push(...splitter.push(input.slice(i, i + size)));
        }
        out.push(...splitter.flush());
        assert.deepEqual(out, reference, `chunk size ${size}`);
      }
    }
  });

  it("emits a finished game without waiting for the next [Event ", () => {
    const splitter = createPgnStreamSplitter();
    const first = text.split(/\n\n+(?=\[Event )/)[0] ?? "";
    assert.equal(splitter.push(`${first}\n\n\n`).length, 1);
    assert.deepEqual(splitter.flush(), []);
  });

  it("keeps a partial game buffered", () => {
    const splitter = createPgnStreamSplitter();
    assert.deepEqual(splitter.push('[Event "x"]\n[Wh'), []);
    assert.deepEqual(splitter.push('ite "A"]\n\n1. e4 e5'), []);
    assert.equal(splitter.flush().length, 1);
  });
});

describe("parseGame", () => {
  const all = (() => {
    const s = createPgnStreamSplitter();
    return [...s.push(fixture("stream.pgn")), ...s.flush()];
  })();

  it("uses the last GameURL segment as id and reads the player headers", () => {
    const update = parseGame(all[0] as string, "djmeJZUw") as LiveGameUpdate;
    assert.equal(update.id, "rKzXoQpT");
    assert.equal(update.roundId, "djmeJZUw");
    assert.deepEqual(update.white, { name: "Abdusattorov, Nodirbek", title: "GM", rating: 2772, fideId: 14204118 });
    assert.deepEqual(update.black, { name: "Duda, Jan-Krzysztof", title: "GM", rating: 2741, fideId: 1170546 });
    assert.equal(update.result, "*");
    assert.equal(lastUrlSegment("https://lichess.org/broadcast/a/round-1/abc/xyz/?x=1"), "xyz");
  });

  it("reads clocks from the last [%clk] of each side and derives lastMoveUci from the move", () => {
    const update = parseGame(all[0] as string, "r") as LiveGameUpdate;
    const clocks = [...(all[0] as string).matchAll(/\[%clk (\d+):(\d+):(\d+)\]/g)].map(
      (m) => ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000,
    );
    assert.equal(update.whiteClockMs, clocks.filter((_, i) => i % 2 === 0).at(-1));
    assert.equal(update.blackClockMs, clocks.filter((_, i) => i % 2 === 1).at(-1));
    assert.match(update.lastMoveUci ?? "", /^[a-h][1-8][a-h][1-8][qrbn]?$/);
    assert.equal(update.fen.split(" ")[1], clocks.length % 2 === 0 ? "w" : "b");
  });

  it("tolerates [%eval] and annotations and normalizes a draw", () => {
    const parsed = all.map((g) => parseGame(g, "r"));
    assert.ok(parsed.every(Boolean));
    const withEval = all.findIndex((g) => g.includes("%eval"));
    assert.ok(withEval >= 0);
    const update = parsed[withEval] as LiveGameUpdate;
    assert.notEqual(update.whiteClockMs, null);
    assert.notEqual(update.blackClockMs, null);
    assert.ok(["1-0", "0-1", "1/2-1/2", "*"].includes(update.result));
    assert.ok(parsed.some((u) => u?.result === "1/2-1/2" || u?.result === "1-0"));
  });

  it("falls back to the WhiteClock/BlackClock headers when there are no moves", () => {
    const pgn = [
      '[Event "E"]', '[White "A, A"]', '[Black "B, B"]', '[Result "*"]', '[WhiteClock "1:30:00"]',
      '[BlackClock "0:45:30"]', '[GameURL "https://lichess.org/broadcast/e/round-1/R1/G1"]', "", "*",
    ].join("\n");
    const update = parseGame(pgn, "R1") as LiveGameUpdate;
    assert.equal(update.id, "G1");
    assert.equal(update.whiteClockMs, 5_400_000);
    assert.equal(update.blackClockMs, 2_730_000);
    assert.equal(update.lastMoveUci, null);
    assert.equal(update.fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    assert.equal(update.white.rating, null);
  });

  it("includes the promotion piece in lastMoveUci and returns null without GameURL", () => {
    const pgn = [
      '[Event "E"]', '[White "A"]', '[Black "B"]', '[Result "*"]', '[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]',
      '[SetUp "1"]', '[GameURL "https://lichess.org/broadcast/e/round-1/R1/G2"]', "", "1. a8=Q+ { [%clk 0:10:00] } *",
    ].join("\n");
    const update = parseGame(pgn, "R1") as LiveGameUpdate;
    assert.equal(update.lastMoveUci, "a7a8q");
    assert.equal(update.whiteClockMs, 600_000);
    assert.equal(parseGame('[Event "x"]\n\n1. e4 *', "R1"), null);
  });

  // SIG-1312: the broadcast [%eval] survives the import (pawns and mate, White's point of view).
  it("importPgn keeps [%eval] in pawns and as mate; a move without one has none", () => {
    const byId = (id: string) => all.find((g) => g.includes(`/${id}"]`)) as string;
    const pawns = importPgn(byId("IoIVJ0i3")).tree.children[0];
    assert.equal(pawns?.san, "e4");
    assert.equal(pawns?.evalPawns, 0.18);
    assert.equal(pawns?.evalMate, undefined);
    assert.ok(pawns?.clockMs !== undefined);

    const mateGame = importPgn(byId("xrcTvFrf")).tree;
    const mainline = [];
    for (let node = mateGame.children[0]; node; node = node.children[0]) {
      mainline.push(node);
    }
    const qxd8 = mainline.at(-2);
    assert.equal(qxd8?.san, "Qxd8");
    assert.equal(qxd8?.evalMate, 4); // `{ [%eval #4] } { comment } { [%clk] }`
    assert.equal(qxd8?.evalPawns, undefined);
    assert.equal(mainline.at(-1)?.evalMate, 3);
    assert.equal(mainline.find((n) => n.san === "Ba8")?.evalPawns, 1.08);

    const black = importPgn('[Event "E"]\n\n1. f3 { [%eval -0.5] } 1... e5 2. g4 { [%eval #-1] } *').tree.children[0];
    assert.equal(black?.evalPawns, -0.5);
    assert.equal(black?.children[0]?.evalPawns, undefined);
    assert.equal(black?.children[0]?.evalMate, undefined);
    assert.equal(black?.children[0]?.children[0]?.evalMate, -1);

    const noEval = importPgn(byId("rKzXoQpT")).tree.children[0];
    assert.equal(noEval?.evalPawns, undefined);
    assert.equal(noEval?.evalMate, undefined);
  });

  it("exposes the [%eval] of the last mainline move as lastEval, null when it has none", () => {
    const byId = (id: string) => parseGame(all.find((g) => g.includes(`/${id}"]`)) as string, "r") as LiveGameUpdate;
    assert.deepEqual(byId("IoIVJ0i3").lastEval, { pawns: 0 });
    assert.deepEqual(byId("xrcTvFrf").lastEval, { mate: 3 });
    assert.equal(byId("rKzXoQpT").lastEval, null);
  });

  it("SIG-1313: reads [ECO] and [Opening]; null when absent, empty or the \"?\" placeholder", () => {
    const update = parseGame(all[0] as string, "r") as LiveGameUpdate;
    assert.equal(update.eco, "A08");
    assert.equal(update.opening, "Zukertort Opening: Reversed Grünfeld");
    const bare = parseGame('[Event "x"]\n[GameURL "https://lichess.org/broadcast/a/r/g1"]\n\n1. e4 *', "r") as LiveGameUpdate;
    assert.equal(bare.eco, null);
    assert.equal(bare.opening, null);
    const unknown = parseGame('[Event "x"]\n[ECO "?"]\n[Opening "  "]\n[GameURL "https://lichess.org/broadcast/a/r/g1"]\n\n1. e4 *', "r") as LiveGameUpdate;
    assert.equal(unknown.eco, null);
    assert.equal(unknown.opening, null);
  });

  it("round PGN fixture goes through importPgn with clocks", () => {
    const first = (createPgnStreamSplitter().push(fixture("round.pgn")) as string[])[0] as string;
    const imported = importPgn(first);
    assert.ok(imported.tree.children[0]?.clockMs !== undefined);
  });
});

describe("HTTP client", () => {
  it("requests the documented endpoints with only an Accept header", async () => {
    let headers: HeadersInit | undefined;
    const calls = mockFetch((_url, init) => {
      headers = init?.headers;
      return Response.json(_url.includes("/top") ? json("top.json") : _url.includes("/-/-/") ? json("round.json") : json("tour.json"));
    });
    assert.ok(await fetchTopBroadcasts(2));
    assert.ok(await fetchTopBroadcasts(99));
    assert.ok(await fetchTour("wLrwkC0C"));
    assert.ok(await fetchRound("djmeJZUw"));
    assert.deepEqual(calls, [
      "https://lichess.org/api/broadcast/top?page=2",
      "https://lichess.org/api/broadcast/top?page=20",
      "https://lichess.org/api/broadcast/wLrwkC0C",
      "https://lichess.org/api/broadcast/-/-/djmeJZUw",
    ]);
    assert.deepEqual(Object.keys(headers as Record<string, string>), ["Accept"]);
  });

  it("fetches the round PGN as text", async () => {
    mockFetch(() => new Response(fixture("round.pgn")));
    assert.equal(await fetchRoundPgn("djmeJZUw"), fixture("round.pgn"));
  });

  it("HTTP 429 throws LiveRateLimitedError with a 60s backoff", async () => {
    mockFetch(() => new Response("slow down", { status: 429 }));
    await assert.rejects(fetchRound("x"), (error: unknown) => {
      assert.ok(error instanceof LiveRateLimitedError);
      assert.ok(error instanceof LiveHttpError);
      assert.equal(error.retryAfterMs, 60_000);
      assert.equal(error.status, 429);
      return true;
    });
    await assert.rejects(streamRound("x", () => undefined), LiveRateLimitedError);
  });

  it("other non-OK responses throw LiveHttpError with the status", async () => {
    mockFetch(() => new Response("nope", { status: 404 }));
    await assert.rejects(fetchTour("x"), (error: unknown) => error instanceof LiveHttpError && error.status === 404);
  });

  it("an aborted signal is silent", async () => {
    mockFetch((_url, init) => new Promise<Response>((_resolve, reject) => {
      const fail = () => reject(new DOMException("aborted", "AbortError"));
      if (init?.signal?.aborted) {
        fail();
      }
      init?.signal?.addEventListener("abort", fail);
    }));
    const controller = new AbortController();
    const pending = fetchRound("x", controller.signal);
    const streaming = streamRound("x", () => assert.fail("no game"), controller.signal);
    controller.abort();
    assert.equal(await pending, null);
    await streaming;
    assert.equal(await fetchTour("x", controller.signal), null);
  });

  it("a network error rejects the stream", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await assert.rejects(streamRound("x", () => undefined), TypeError);
  });

  it("streams games from chunks cut mid-tag and mid-move, then resolves", async () => {
    const text = fixture("stream.pgn");
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 211) {
      chunks.push(text.slice(i, i + 211));
    }
    const calls = mockFetch(() => streamingResponse(chunks));
    const updates: LiveGameUpdate[] = [];
    await streamRound("djmeJZUw", (u) => updates.push(u));
    assert.equal(calls[0], "https://lichess.org/api/stream/broadcast/round/djmeJZUw.pgn?comments=false");
    assert.equal(updates.length, 4);
    assert.ok(updates.every((u) => u.roundId === "djmeJZUw" && u.id.length > 0));
    assert.equal(updates[0]?.id, "rKzXoQpT");
  });
});
