/* eslint-disable @typescript-eslint/no-unused-vars */
// TEMPORARY PLACEHOLDER (SIG-1274). SIG-1272 replaces this file with the real
// multi-source query layer; the signature below is the contract it must keep.
import type { LibraryFilterState, LibraryQueryResult } from "./types";

export async function queryLibrary(
  _filters: LibraryFilterState,
  _cursor: string | null,
  _limit: number,
  _signal: AbortSignal,
): Promise<LibraryQueryResult> {
  return { items: [], nextCursor: null, total: 0, sourceErrors: {} };
}
