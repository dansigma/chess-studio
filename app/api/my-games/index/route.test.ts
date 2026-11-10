// SIG-1275: backfill route auth, rate limit and batch behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "@/src/test-utils/stubs/next-server.ts";
import { mockSupabaseModules, nextTestIp, type FakeSupabaseState } from "@/src/test-utils/route-test.ts";

const state: FakeSupabaseState = {};
mockSupabaseModules(state);
const { POST } = await import("./route.ts");

const PGN = '[White "A"]\n[Black "B"]\n\n1. e4 e5 *';

function post(ip = nextTestIp()): NextRequest {
  return new NextRequest("http://app.test/api/my-games/index", { method: "POST", headers: { "x-forwarded-for": ip } });
}

function userClient(userId: string | null, pending: Array<{ id: string; pgn: string }>, remaining = 0) {
  const chain = (head: boolean) => {
    const c: Record<string, unknown> = {};
    c.eq = () => c;
    c.is = () => (head ? Promise.resolve({ count: remaining, error: null }) : c);
    c.order = () => c;
    c.limit = () => Promise.resolve({ data: pending, error: null });
    return c;
  };
  return {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: () => ({ select: (_cols: string, opts?: { head?: boolean }) => chain(Boolean(opts?.head)) }),
  };
}

function serviceClient(log: string[]) {
  return {
    from: (table: string) => ({
      upsert: async () => {
        log.push(`upsert:${table}`);
        return { error: null };
      },
      update: () => ({ eq: () => ({ eq: async () => (log.push(`update:${table}`), { error: null }) }) }),
    }),
  };
}

test("anonymous request gets 401", async () => {
  state.server = userClient(null, []);
  assert.equal((await POST(post())).status, 401);
});

test("503 without a service client", async () => {
  state.server = userClient("u1", []);
  state.service = null;
  assert.equal((await POST(post())).status, 503);
});

test("indexes a batch and reports remaining", async () => {
  const log: string[] = [];
  state.server = userClient("u1", [{ id: "g1", pgn: PGN }], 3);
  state.service = serviceClient(log);
  const res = await POST(post());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { indexed: 1, failed: 0, remaining: 3 });
  assert.deepEqual(log, ["upsert:my_game_positions", "update:my_games"]);
});

test("rate limits per user", async () => {
  state.server = userClient("u-limited", []);
  state.service = serviceClient([]);
  let last = 200;
  for (let i = 0; i < 241; i += 1) {
    last = (await POST(post())).status;
  }
  assert.equal(last, 429);
});
