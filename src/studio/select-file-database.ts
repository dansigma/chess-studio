import type { FileDatabase } from "@/src/lib/user-files";

// SIG-864: strict id match with no fallback. When the active database id is
// gone (deleted, or pointing at a database that was never imported), the
// caller renders its empty state instead of silently showing another database.
export function selectFileDatabase(
  databases: FileDatabase[],
  databaseId: string | null,
): FileDatabase | null {
  if (databaseId === null) {
    return null;
  }
  return databases.find((item) => item.id === databaseId) ?? null;
}
