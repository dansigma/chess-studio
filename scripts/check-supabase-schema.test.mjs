import assert from "node:assert/strict";
import test from "node:test";
import { PROBES, getSchemaCheckEnv, probeSchema } from "./check-supabase-schema.mjs";

function okResponse() {
  return { ok: true, status: 200, text: async () => "[]" };
}

test("probes cover the SIG-1188 objects", () => {
  assert.deepEqual(
    PROBES.map((probe) => probe.object),
    ["linked_accounts", "my_games", "my_game_positions", "my_games.indexed_at", "puzzles", "course_enrollments", "boards.repertoire_color"],
  );
});

test("all-2xx probes return no failures", async () => {
  const seen = [];
  const failures = await probeSchema({
    url: "https://example.supabase.co",
    key: "dummy-key",
    fetchFn: async (endpoint) => {
      seen.push(String(endpoint));
      return okResponse();
    },
  });
  assert.deepEqual(failures, []);
  assert.equal(seen.length, PROBES.length);
  assert.ok(seen[0].includes("/rest/v1/linked_accounts?select=*&limit=1"));
});

test("a 404 PGRST205 names the exact failing object", async () => {
  const failures = await probeSchema({
    url: "https://example.supabase.co",
    key: "dummy-key",
    fetchFn: async (endpoint) => {
      if (String(endpoint).includes("/rest/v1/linked_accounts")) {
        return {
          ok: false,
          status: 404,
          text: async () =>
            JSON.stringify({
              code: "PGRST205",
              message: "Could not find the table 'public.linked_accounts' in the schema cache",
            }),
        };
      }
      return okResponse();
    },
  });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].object, "linked_accounts");
  assert.equal(failures[0].status, 404);
  assert.equal(failures[0].code, "PGRST205");
});

test("missing env reports the missing variable", () => {
  const { missing } = getSchemaCheckEnv({});
  assert.deepEqual(missing, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
});
