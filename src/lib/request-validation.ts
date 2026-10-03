export function isExplorerFen(value: string | null): value is string {
  if (!value || value.length > 120) return false;
  return /^(?:[rnbqkpRNBQKP1-8]+\/){7}[rnbqkpRNBQKP1-8]+ [wb] (?:K?Q?k?q?|-) (?:[a-h][36]|-)(?: \d+ \d+)?$/.test(value);
}
export function isPlayerUsername(value: string | null): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(value);
}
export function isSearchQuery(value: string | null): value is string {
  const q = value?.trim() ?? "";
  return q.length >= 2 && q.length <= 40;
}
