// Pure helper (no server imports) so client code can reuse it. SIG-1210 / SIG-1212.
/**
 * Human opening name from a Chess.com opening URL slug, e.g.
 * ".../openings/Queens-Pawn-Opening-1...c6" -> "Queen's Pawn Opening" and
 * "Sicilian-Defense-Najdorf-Variation-6.Bg5" -> "Sicilian Defense Najdorf
 * Variation". Returns null when the value is not an openings URL/slug.
 */
export function chesscomOpeningNameFromUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const marker = "/openings/";
  const at = value.indexOf(marker);
  if (at === -1) {
    return null;
  }
  let slug = value.slice(at + marker.length).split(/[?#]/)[0] ?? "";
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw slug
  }
  slug = slug.replace(/\/+$/, "");
  // The move-sequence suffix starts at the first "-<move number>." segment.
  const moves = /-\d+\./.exec(slug);
  if (moves) {
    slug = slug.slice(0, moves.index);
  }
  const name = slug
    .replace(/-+/g, " ")
    .replace(/\b(Queen|King)s (?=Pawn|Gambit|Indian)/g, "$1's ")
    .trim();
  return name || null;
}
