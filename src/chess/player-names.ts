// SIG-1193: PGN placeholders in any UI language. "Black" stayed bright
// before because only the localized fallback ("Pretas") counted as empty.
// Pure so the review verdict (SIG-1207) can share it with the notation header.
const PLACEHOLDER_NAMES = new Set(["", "?", "white", "black", "brancas", "pretas"]);

export function isPlaceholderPlayer(name: string | undefined): boolean {
  return PLACEHOLDER_NAMES.has((name ?? "").trim().toLowerCase());
}
