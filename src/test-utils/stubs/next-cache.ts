// Mutable `next/cache` stand-in for `node --test`.
//
// Production code imports `revalidatePath` from `next/cache`; under the test
// runner (see scripts/test-resolve.mjs STUBS) that import resolves here, so
// tests can assert exactly which paths an action revalidates.

export const revalidateCalls: Array<{ path: string; type?: string }> = [];

export function revalidatePath(path: string, type?: "page" | "layout"): void {
  revalidateCalls.push({ path, type });
}

export function resetRevalidateCalls(): void {
  revalidateCalls.length = 0;
}
