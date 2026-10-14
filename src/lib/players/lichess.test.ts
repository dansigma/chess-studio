import assert from "node:assert/strict";
import test from "node:test";
import { hitFromLichessUser, lichessWinner } from "./lichess.ts";

test("hitFromLichessUser builds a Lichess hit with a title", () => {
  const hit = hitFromLichessUser({ id: "DrNykterstein", name: "Magnus Carlsen", title: "GM" }, "fallback");
  assert.deepEqual(hit, {
    id: "lichess:DrNykterstein",
    source: "lichess",
    username: "DrNykterstein",
    displayName: "GM Magnus Carlsen",
    subtitle: "Lichess",
    title: "GM",
  });
});

test("hitFromLichessUser falls back to the query when the payload has no names", () => {
  const hit = hitFromLichessUser({}, "Hikaru");
  assert.equal(hit?.username, "Hikaru");
  assert.equal(hit?.displayName, "Hikaru");
});

test("hitFromLichessUser returns null for closed or empty accounts", () => {
  assert.equal(hitFromLichessUser({ id: "someone", disabled: true }, "someone"), null);
  assert.equal(hitFromLichessUser({}, ""), null);
});

test("lichessWinner prefers the declared winner then draw statuses", () => {
  assert.equal(lichessWinner({ winner: "white" }), "white");
  assert.equal(lichessWinner({ winner: "black" }), "black");
  assert.equal(lichessWinner({ status: "draw" }), "draw");
  assert.equal(lichessWinner({ status: "stalemate" }), "draw");
  assert.equal(lichessWinner({ status: "started" }), null);
});
