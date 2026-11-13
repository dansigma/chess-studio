// SIG-1315: the Studio link for a live game (build, parse, clear) and the shared PGN headers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { liveGameStudioHeaders, liveStudioHref, parseLiveStudioLink, withoutLiveStudioLink } from "./live-studio-link.ts";

test("liveStudioHref names the round, the game and the shown ply", () => {
  assert.equal(liveStudioHref({ roundId: "djmeJZUw", gameId: "rKzXoQpT", ply: 12 }), "/studio?broadcast=djmeJZUw%3ArKzXoQpT&ply=12");
  assert.equal(liveStudioHref({ roundId: "R1", gameId: "a", ply: 0 }), "/studio?broadcast=R1%3Aa&ply=0");
});

test("liveStudioHref leaves out ply when following the latest move (or for an invalid ply)", () => {
  assert.equal(liveStudioHref({ roundId: "R1", gameId: "a" }), "/studio?broadcast=R1%3Aa");
  assert.equal(liveStudioHref({ roundId: "R1", gameId: "a", ply: -1 }), "/studio?broadcast=R1%3Aa");
  assert.equal(liveStudioHref({ roundId: "R1", gameId: "a", ply: 1.5 }), "/studio?broadcast=R1%3Aa");
});

test("parseLiveStudioLink round-trips the link, with and without ply", () => {
  for (const link of [{ roundId: "R1", gameId: "a", ply: 7 }, { roundId: "R1", gameId: "a" }]) {
    const href = liveStudioHref(link);
    assert.deepEqual(parseLiveStudioLink(href.slice(href.indexOf("?"))), link);
  }
  assert.deepEqual(parseLiveStudioLink("?view=library&broadcast=R1:a&ply=3"), { roundId: "R1", gameId: "a", ply: 3 });
});

test("parseLiveStudioLink ignores invalid values", () => {
  assert.equal(parseLiveStudioLink(""), null);
  assert.equal(parseLiveStudioLink("?broadcast="), null);
  assert.equal(parseLiveStudioLink("?broadcast=R1"), null);
  assert.equal(parseLiveStudioLink("?broadcast=:a"), null);
  assert.equal(parseLiveStudioLink("?broadcast=R1:a:b"), null);
  for (const ply of ["-1", "x", "1.5", "", "1e3"]) {
    assert.deepEqual(parseLiveStudioLink(`?broadcast=R1:a&ply=${ply}`), { roundId: "R1", gameId: "a" }, ply);
  }
});

test("withoutLiveStudioLink drops only the link params", () => {
  assert.equal(withoutLiveStudioLink("?broadcast=R1:a&ply=3"), "");
  assert.equal(withoutLiveStudioLink("?view=library&broadcast=R1:a&ply=3"), "?view=library");
  assert.equal(withoutLiveStudioLink(""), "");
});

test("liveGameStudioHeaders: event, site, players, Elo, titles and result", () => {
  const headers = liveGameStudioHeaders({
    event: "Open A",
    site: "https://lichess.org/broadcast/t/r/R1",
    white: { name: "Carlsen, M.", rating: 2830, title: "GM" },
    black: { name: "Doe, J.", rating: null, title: null },
    result: "1-0",
  });
  assert.deepEqual(headers, {
    Event: "Open A",
    Site: "https://lichess.org/broadcast/t/r/R1",
    White: "Carlsen, M.",
    Black: "Doe, J.",
    Result: "1-0",
    WhiteElo: "2830",
    WhiteTitle: "GM",
  });
  const fallback = liveGameStudioHeaders({
    white: { name: "W", rating: null, title: null },
    black: { name: "B", rating: 2500, title: "IM" },
    result: "*",
  });
  assert.equal(fallback.Event, "Lichess Broadcast");
  assert.equal(fallback.Site, "https://lichess.org/broadcast");
  assert.equal(fallback.BlackElo, "2500");
  assert.equal(fallback.BlackTitle, "IM");
});
