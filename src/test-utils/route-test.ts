// Shared fakes for `node --test` route suites (see
// `.artifacts/plans/issue-932.md` Phase 1).
//
// Two rules keep suites isolated despite module-level limiter/cache state in
// the routes:
// - every request uses a fresh IP from `nextTestIp()` (rate-limit keys are
//   per IP), except 429 tests which deliberately reuse one IP;
// - Supabase boundaries are mocked once per file via holder objects the tests
//   mutate, because `mock.module` only affects imports that happen after it
//   registers — routes are therefore imported dynamically *after* the mock
//   calls, and per-test variation goes through the holder, not re-mocking.

import { mock, type TestContext } from "node:test";
import { NextRequest } from "./stubs/next-server.ts";
import { __setRequestHeaders } from "./stubs/next-headers.ts";

// ---------------------------------------------------------------------------
// Requests / IPs
// ---------------------------------------------------------------------------

let ipCounter = 0;

/** Unique `10.x.y.z` address per call, keeping in-memory limiters isolated. */
export function nextTestIp(): string {
  ipCounter += 1;
  const a = (ipCounter >> 16) & 0xff;
  const b = (ipCounter >> 8) & 0xff;
  const c = ipCounter & 0xff;
  return `10.${a}.${b}.${c}`;
}

/** GET request against the `next/server` stub with an `x-forwarded-for` IP. */
export function makeGetRequest(url: string, ip = nextTestIp()): NextRequest {
  return new NextRequest(url, { headers: { "x-forwarded-for": ip } });
}

/** Install the headers returned by the `next/headers` stub's `headers()`. */
export function setRequestHeaders(headers: Headers): void {
  __setRequestHeaders(headers);
}

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

export type FetchRouter = (
  url: string,
  init?: RequestInit,
) => Response | null | Promise<Response | null>;

/**
 * Route `globalThis.fetch` through `router`; unmatched URLs throw so tests
 * fail loudly instead of hitting the network. Restored after the test.
 */
export function mockFetch(t: TestContext, router: FetchRouter): void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const routed = await router(url, init);
    if (routed) {
      return routed;
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Supabase fakes (installed at the createServerSupabase boundary)
// ---------------------------------------------------------------------------

export interface FakeSupabaseState {
  server?: unknown;
  service?: unknown;
}

/**
 * Register `mock.module` for the Supabase factories once per file, *before*
 * dynamically importing the route under test. Per-test behavior varies by
 * mutating `state` — re-mocking per test does not work because the route
 * module (and its bindings) is cached after the first import.
 */
export function mockSupabaseModules(state: FakeSupabaseState): void {
  mock.module("@/src/lib/supabase/server.ts", {
    namedExports: {
      createServerSupabase: async () => state.server ?? null,
      createPublicServerSupabase: () => null,
    },
  });
  mock.module("@/src/lib/supabase/admin.ts", {
    namedExports: {
      createServiceSupabase: () => state.service ?? null,
    },
  });
}

export interface FakeTableConfig {
  /** Row (or null) returned by the terminal `maybeSingle()` call. */
  maybeSingle?: unknown;
  /** Error returned by `upsert` / `insert` on this table. */
  writeError?: unknown;
}

export interface SupabaseCallLog {
  from: string[];
  upsert: Array<{ table: string; row: unknown }>;
  insert: Array<{ table: string; row: unknown }>;
  updateUserById: Array<{ id: string; attrs: unknown }>;
}

interface FakeSelectable {
  eq(col: string, val: unknown): FakeSelectable;
  maybeSingle(): Promise<{ data: unknown; error: null }>;
}

export interface FakeSupabaseClient {
  calls: SupabaseCallLog;
  authCalls: Array<{ method: string; args: unknown[] }>;
  from(table: string): {
    select(...args: unknown[]): FakeSelectable;
    upsert(row: unknown): Promise<{ data: unknown; error: unknown }>;
    insert(row: unknown): Promise<{ data: unknown; error: unknown }>;
  };
  auth: {
    admin: {
      updateUserById(id: string, attrs: unknown): Promise<{ data: unknown; error: unknown }>;
    };
    signInWithPassword(...args: unknown[]): Promise<unknown>;
    signUp(...args: unknown[]): Promise<unknown>;
    resetPasswordForEmail(...args: unknown[]): Promise<unknown>;
    signOut(...args: unknown[]): Promise<unknown>;
    exchangeCodeForSession(...args: unknown[]): Promise<unknown>;
  };
}

export interface FakeSupabaseAuthHandlers {
  signInWithPassword?: (...args: unknown[]) => Promise<unknown>;
  signUp?: (...args: unknown[]) => Promise<unknown>;
  resetPasswordForEmail?: (...args: unknown[]) => Promise<unknown>;
  signOut?: (...args: unknown[]) => Promise<unknown>;
  exchangeCodeForSession?: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Chainable query-builder fake covering exactly the chains routes use:
 * `from(t).select(..).eq(..)[.eq(..)].maybeSingle()`, `from(t).upsert(row)`,
 * `from(t).insert(row)`, `auth.admin.updateUserById(id, attrs)`, plus the auth
 * methods actions/callback use (`signInWithPassword`, `signUp`,
 * `resetPasswordForEmail`, `signOut`, `exchangeCodeForSession`). Auth calls
 * are recorded in `authCalls` and answered by per-test `handlers`.
 */
export function createFakeSupabase(
  options: {
    tables?: Record<string, FakeTableConfig>;
    auth?: FakeSupabaseAuthHandlers;
    /** Error returned by `auth.admin.updateUserById`. */
    updateUserError?: unknown;
  } = {},
): FakeSupabaseClient {
  const calls: SupabaseCallLog = { from: [], upsert: [], insert: [], updateUserById: [] };
  const authCalls: FakeSupabaseClient["authCalls"] = [];
  const resolveMaybeSingle = (table: string) => ({
    data: options.tables?.[table]?.maybeSingle ?? null,
    error: null,
  });
  const selectable = (table: string): FakeSelectable => {
    const chain: FakeSelectable = {
      eq: () => chain,
      maybeSingle: async () => resolveMaybeSingle(table),
    };
    return chain;
  };
  return {
    calls,
    authCalls,
    from: (table: string) => {
      calls.from.push(table);
      return {
        select: () => selectable(table),
        upsert: async (row: unknown) => {
          calls.upsert.push({ table, row });
          return { data: row, error: options.tables?.[table]?.writeError ?? null };
        },
        insert: async (row: unknown) => {
          calls.insert.push({ table, row });
          return { data: row, error: options.tables?.[table]?.writeError ?? null };
        },
      };
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: unknown) => {
          calls.updateUserById.push({ id, attrs });
          return { data: { user: null }, error: options.updateUserError ?? null };
        },
      },
      signInWithPassword: async (...args: unknown[]) => {
        authCalls.push({ method: "signInWithPassword", args });
        return options.auth?.signInWithPassword
          ? options.auth.signInWithPassword(...args)
          : { data: { user: null }, error: null };
      },
      signUp: async (...args: unknown[]) => {
        authCalls.push({ method: "signUp", args });
        return options.auth?.signUp
          ? options.auth.signUp(...args)
          : { data: { user: null }, error: null };
      },
      resetPasswordForEmail: async (...args: unknown[]) => {
        authCalls.push({ method: "resetPasswordForEmail", args });
        return options.auth?.resetPasswordForEmail
          ? options.auth.resetPasswordForEmail(...args)
          : { data: null, error: null };
      },
      signOut: async (...args: unknown[]) => {
        authCalls.push({ method: "signOut", args });
        return options.auth?.signOut
          ? options.auth.signOut(...args)
          : { error: null };
      },
      exchangeCodeForSession: async (...args: unknown[]) => {
        authCalls.push({ method: "exchangeCodeForSession", args });
        return options.auth?.exchangeCodeForSession
          ? options.auth.exchangeCodeForSession(...args)
          : { data: { user: null }, error: null };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// players-server fakes
// ---------------------------------------------------------------------------

export interface PlayersServerStubs {
  searchPlayers?: (query: string) => Promise<unknown>;
  searchFidePlayers?: (query: string) => Promise<unknown>;
  loadPlayerGames?: (
    source: string,
    username: string,
    displayName?: string,
    subtitle?: string,
  ) => Promise<unknown>;
}

function unstubbed(name: string): (...args: unknown[]) => Promise<never> {
  return async () => {
    throw new Error(`${name} not stubbed for this test`);
  };
}

/** Same holder pattern as `mockSupabaseModules`: register once, mutate `stubs`. */
export function mockPlayersServer(stubs: PlayersServerStubs): void {
  mock.module("@/src/lib/players-server.ts", {
    namedExports: {
      searchPlayers: async (query: string) =>
        stubs.searchPlayers ? stubs.searchPlayers(query) : unstubbed("searchPlayers")(),
      searchFidePlayers: async (query: string) =>
        stubs.searchFidePlayers ? stubs.searchFidePlayers(query) : unstubbed("searchFidePlayers")(),
      loadPlayerGames: async (source: string, username: string, displayName?: string, subtitle?: string) =>
        stubs.loadPlayerGames
          ? stubs.loadPlayerGames(source, username, displayName, subtitle)
          : unstubbed("loadPlayerGames")(),
    },
  });
}

/** Replace `finishSignIn` with `spy`: register once, inspect `spy` per test. */
export function mockFinishSignIn(spy: (...args: never[]) => Promise<void> | void): void {
  mock.module("@/src/lib/auth/access.ts", {
    namedExports: { finishSignIn: spy },
  });
}

// ---------------------------------------------------------------------------
// Cloudflare env (engine route)
// ---------------------------------------------------------------------------

/** Control what the `cloudflare:workers` stub's `env` exposes. */
export function setCloudflareEnv(env: Record<string, unknown>): void {
  (globalThis as { __CF_ENV?: Record<string, unknown> }).__CF_ENV = env;
}

export interface FakeBucketObject {
  body: string;
  contentType?: string;
  etag?: string;
}

/** In-memory R2 bucket fake for the engine route. */
export function fakeEngineBucket(objects: Record<string, FakeBucketObject>) {
  return {
    get: async (key: string) => {
      const obj = objects[key];
      if (!obj) {
        return null;
      }
      const bytes = new TextEncoder().encode(obj.body);
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        httpEtag: obj.etag ?? `"${key}"`,
        size: bytes.length,
        writeHttpMetadata: (headers: Headers) => {
          if (obj.contentType) {
            headers.set("Content-Type", obj.contentType);
          }
        },
      };
    },
  };
}
