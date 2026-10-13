// `cloudflare:workers` stand-in: the engine route reads `env.ENGINE`.
// Tests control the binding through `globalThis.__CF_ENV`; a Proxy keeps
// reads live so each test can install its own fake bucket after import.
function currentEnv(): Record<string, unknown> {
  return (globalThis as { __CF_ENV?: Record<string, unknown> }).__CF_ENV ?? {};
}

export const env: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
  get(_target, prop: string) {
    return currentEnv()[prop];
  },
  has(_target, prop: string) {
    return prop in currentEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(currentEnv());
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    const value = currentEnv()[prop];
    if (value === undefined) return undefined;
    return { configurable: true, enumerable: true, writable: true, value };
  },
});
