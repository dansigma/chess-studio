import assert from "node:assert/strict";
import test from "node:test";
import { mapFidePlayers } from "./fide-players.ts";

test("maps valid FIDE rows with title and standard rating", () => {
  const suggestions = mapFidePlayers([
    { id: 1503014, name: "Carlsen, Magnus", federation: "NOR", title: "GM", standard: 2823 },
  ]);
  assert.deepEqual(suggestions, [
    { id: "fide:1503014", name: "Carlsen, Magnus", federation: "NOR", title: "GM", rating: 2823 },
  ]);
});

test("tolerates the { result: [...] } envelope", () => {
  const suggestions = mapFidePlayers({
    result: [{ id: "3093610", name: "Gukesh D", federation: "IND", title: "GM", standard: 2798 }],
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.name, "Gukesh D");
});

test("skips rows without a usable name or id", () => {
  const suggestions = mapFidePlayers([
    { id: 1, name: "  " },
    { id: 2 },
    { name: "Nameless" },
    null,
    "Carlsen, Magnus",
    { id: 3, name: "Nakamura, Hikaru" },
  ]);
  assert.deepEqual(suggestions, [{ id: "fide:3", name: "Nakamura, Hikaru" }]);
});

test("returns [] for non-array payloads", () => {
  assert.deepEqual(mapFidePlayers(null), []);
  assert.deepEqual(mapFidePlayers({}), []);
  assert.deepEqual(mapFidePlayers("carlsen"), []);
});

test("preserves upstream order and caps at the limit", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    name: `Player, ${index + 1}`,
  }));
  const suggestions = mapFidePlayers(rows, 8);
  assert.equal(suggestions.length, 8);
  assert.equal(suggestions[0]?.name, "Player, 1");
  assert.equal(suggestions[7]?.name, "Player, 8");
});

test("omits rating when standard is null or absent", () => {
  const suggestions = mapFidePlayers([
    { id: 1, name: "Carlsen, Magnus", standard: null },
    { id: 2, name: "Nakamura, Hikaru" },
  ]);
  assert.equal(suggestions[0]?.rating, undefined);
  assert.equal(suggestions[1]?.rating, undefined);
});
