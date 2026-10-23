// SIG-1038: `updateSession` must not create a Supabase client off the admin path.
// `next/server` has no node-runnable implementation for `NextResponse.next()`,
// so this file mocks it (plus `@supabase/ssr`) in-file instead of touching the
// shared stub — same `mock.module` + dynamic-import pattern as access.test.ts.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "dummy-key";

type Cookie = { name: string; value: string };

function cookieStore() {
  const jar = new Map<string, string>();
  return {
    getAll: (): Cookie[] => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  };
}

class FakeNextResponse {
  status: number;
  headers = new Headers();
  cookies = cookieStore();

  constructor(status: number) {
    this.status = status;
  }

  static next(): FakeNextResponse {
    return new FakeNextResponse(200);
  }

  static redirect(url: string | URL): FakeNextResponse {
    const response = new FakeNextResponse(307);
    response.headers.set("Location", String(url));
    return response;
  }
}

class FakeNextRequest {
  nextUrl: URL;
  cookies = cookieStore();

  constructor(path: string) {
    const url = new URL(`http://localhost:3000${path}`);
    // The real `nextUrl` is a NextURL with `clone()`; a plain URL plus a
    // `clone()` shim is all `updateSession` needs.
    this.nextUrl = Object.assign(url, {
      clone: () => new URL(url.toString()),
    });
  }
}

const createCalls: unknown[][] = [];
const fakeClient = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
  },
};

mock.module("next/server", {
  namedExports: {
    NextRequest: FakeNextRequest,
    NextResponse: FakeNextResponse,
  },
});
mock.module("@supabase/ssr", {
  namedExports: {
    createServerClient: (...args: unknown[]) => {
      createCalls.push(args);
      return fakeClient;
    },
  },
});

const { updateSession } = (await import("@/src/lib/supabase/middleware.ts")) as {
  updateSession: (request: unknown) => Promise<FakeNextResponse>;
};

function makeRequest(path: string): unknown {
  return new FakeNextRequest(path);
}

test("sig-1038 /studio creates no Supabase client", async () => {
  createCalls.length = 0;
  const response = await updateSession(makeRequest("/studio"));
  assert.equal(createCalls.length, 0, "no Supabase client for /studio");
  assert.equal(response.status, 200);
});

test("sig-1038 /api/explorer creates no Supabase client", async () => {
  createCalls.length = 0;
  const response = await updateSession(makeRequest("/api/explorer"));
  assert.equal(createCalls.length, 0, "no Supabase client for /api/explorer");
  assert.equal(response.status, 200);
});

test("sig-1038 /courses/adminx is not a gate path", async () => {
  createCalls.length = 0;
  const response = await updateSession(makeRequest("/courses/adminx"));
  assert.equal(createCalls.length, 0, "no Supabase client for /courses/adminx");
  assert.equal(response.status, 200);
});

test("sig-1038 /courses/admin creates a client and redirects anonymous users", async () => {
  createCalls.length = 0;
  const response = await updateSession(makeRequest("/courses/admin"));
  assert.equal(createCalls.length, 1, "Supabase client created for /courses/admin");
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("Location"), "http://localhost:3000/login?next=%2Fcourses%2Fadmin");
});
