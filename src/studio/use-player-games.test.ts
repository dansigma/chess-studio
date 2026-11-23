import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerHit } from "@/src/lib/player-types";
import { loadStudioPlayerGames } from "./use-player-games";

const player: PlayerHit = {
  id: "lichess:one", source: "lichess", username: "one", displayName: "One", subtitle: "Lichess",
};

test("the player games cache shares pending and completed fetches and isolates players", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ games: [] }));
  const first = loadStudioPlayerGames(player);
  assert.equal(loadStudioPlayerGames({ ...player }), first);
  await first;
  assert.equal(loadStudioPlayerGames(player), first);
  assert.equal(fetch.mock.callCount(), 1);

  await loadStudioPlayerGames({ ...player, id: "lichess:two", username: "two" });
  assert.equal(fetch.mock.callCount(), 2);
});

test("a failed player games request can be retried", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 502 }));
  const retryPlayer = { ...player, id: "lichess:retry", username: "retry" };
  await assert.rejects(loadStudioPlayerGames(retryPlayer));
  await assert.rejects(loadStudioPlayerGames(retryPlayer));
  assert.equal(fetch.mock.callCount(), 2);
});
