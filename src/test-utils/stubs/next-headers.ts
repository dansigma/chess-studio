// Mutable `next/headers` stand-in for `node --test`.
//
// `headers()` returns whatever the test installed via `__setRequestHeaders`;
// `cookies()` returns an empty store — routes under test never write cookies
// directly (the Supabase client is mocked at the `createServerSupabase`
// boundary instead).

let requestHeaders = new Headers();

export function __setRequestHeaders(headers: Headers): void {
  requestHeaders = headers;
}

export async function headers(): Promise<Headers> {
  return requestHeaders;
}

export async function cookies() {
  return {
    getAll: () => [] as Array<{ name: string; value: string }>,
    set: () => {},
    get: () => undefined,
  };
}
