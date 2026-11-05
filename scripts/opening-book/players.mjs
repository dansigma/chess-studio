// scripts/opening-book/players.mjs
// SIG-1229: player identity for the masters/correspondence profiles. A move is
// only theory when enough DISTINCT players played it, so "Carlsen, Magnus",
// "Carlsen, M", "Carlsen,M." and "Magnus Carlsen" must all be the same player.

const UNKNOWN = new Set(["", "?", "??", "-", "--", "unknown", "anonymous", "anon", "nn", "n.n.", "n n", "no name", "computer"]);
const TITLE = /^(?:gm|im|fm|cm|nm|wgm|wim|wfm|wcm|sim|gim|dr|prof|mr|ms)\.?\s+/i;

function plain(text) {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae");
}

/**
 * Normalized player identity: "surname, f" (lowercase, no accents, first
 * initial only), or "" when the name is unknown. Handles "Surname, First
 * Middle", "Surname,F.", "First Surname" (no comma: the last token is the
 * surname), diacritics, case, extra spaces, trailing "(GM)" / "[NOR]" tags and
 * a leading title. Compound surnames written without a comma ("Le Quang Liem")
 * cannot be told apart from given names and normalize to "liem, l".
 */
export function normalizePlayer(name) {
  let text = plain(String(name ?? ""))
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TITLE, "");
  if (UNKNOWN.has(text)) {
    return "";
  }
  let surname;
  let given;
  const comma = text.indexOf(",");
  if (comma >= 0) {
    surname = text.slice(0, comma);
    given = text.slice(comma + 1);
  } else {
    const tokens = text.split(" ").filter(Boolean);
    surname = tokens[tokens.length - 1] ?? "";
    given = tokens.slice(0, -1).join(" ");
  }
  surname = surname.replace(/[^a-z\- ]/g, "").replace(/\s+/g, " ").trim();
  const initial = /[a-z]/.exec(given.replace(/[^a-z ]/g, ""))?.[0] ?? "";
  if (surname === "" || UNKNOWN.has(surname)) {
    return "";
  }
  return initial ? `${surname}, ${initial}` : surname;
}

/** 32-bit FNV-1a of a normalized name; 0 is reserved for "unknown", so a real hash is never 0. */
export function playerHash(normalized) {
  if (normalized === "") {
    return 0;
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || 1;
}
