// `next/navigation` stand-in: real `redirect()` throws a special digest that
// Next's error boundary catches. Tests assert on the thrown URL instead.
export const REDIRECT_DIGEST_PREFIX = "NEXT_REDIRECT;";

export function redirect(url: string): never {
  throw new Error(`${REDIRECT_DIGEST_PREFIX}${url}`);
}

export function isRedirectError(error: unknown, url?: string): boolean {
  if (!(error instanceof Error)) return false;
  if (!error.message.startsWith(REDIRECT_DIGEST_PREFIX)) return false;
  return url === undefined || error.message === `${REDIRECT_DIGEST_PREFIX}${url}`;
}

export function redirectUrl(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (!error.message.startsWith(REDIRECT_DIGEST_PREFIX)) return null;
  return error.message.slice(REDIRECT_DIGEST_PREFIX.length);
}
