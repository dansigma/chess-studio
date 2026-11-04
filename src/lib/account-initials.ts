// SIG-1216: avatar initials for the account chip. Pure, so it is unit-tested
// without the DOM. With a display name: first letter of the first word plus
// first letter of the last word ("Danilo Alves" -> "DA", "Danilo" -> "D").
// Without one: the e-mail local-part behaviour from SIG-1215, unchanged.

function firstLetter(word: string): string | null {
  for (const char of Array.from(word)) {
    if (/\p{L}/u.test(char)) {
      return char;
    }
  }
  return null;
}

export function emailInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : local.slice(0, 2);
  return letters.toUpperCase() || "?";
}

export function accountInitials(name: string | null | undefined, email: string): string {
  // Words without any letter (e.g. "-", "123") are skipped.
  const letters = (name ?? "")
    .split(/\s+/)
    .map(firstLetter)
    .filter((letter): letter is string => letter !== null);
  if (letters.length === 0) {
    return emailInitials(email);
  }
  const first = letters[0];
  const last = letters[letters.length - 1];
  return (letters.length === 1 ? first : `${first}${last}`).toUpperCase();
}
