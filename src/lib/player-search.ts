export function playerNameMatches(name: string, query: string): boolean {
  const n = normalizeName(name);
  const q = normalizeName(query);
  if (!q) {
    return false;
  }
  if (n.includes(q)) {
    return true;
  }
  const nameParts = n.split(" ").filter(Boolean);
  const queryParts = q.split(" ").filter(Boolean);
  if (queryParts.length === 0) {
    return false;
  }
  if (queryParts.every((part) => nameParts.some((namePart) => namePart.includes(part)))) {
    return true;
  }
  if (nameParts.length >= 2) {
    const flipped = `${nameParts[nameParts.length - 1]} ${nameParts.slice(0, -1).join(" ")}`;
    if (flipped.includes(q)) {
      return true;
    }
  }
  return false;
}

export function usernameCandidates(query: string): string[] {
  const trimmed = query.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  function add(value: string) {
    const candidate = value.replace(/[^\w-]/g, "");
    if (!/^[a-zA-Z0-9_-]{3,25}$/.test(candidate)) {
      return;
    }
    const key = candidate.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push(candidate);
  }
  add(trimmed);
  add(trimmed.replace(/\s+/g, ""));
  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  if (parts.length >= 2) {
    add(parts.join(""));
    add(`${parts[parts.length - 1]}${parts[0]}`);
  }
  return out;
}

export function isClosedLichessUser(user: { disabled?: boolean }): boolean {
  return user.disabled === true;
}

export function usableDisplayName(name: string | undefined, username: string): string {
  const trimmed = name?.trim() ?? "";
  if (trimmed && /[a-zA-Z]/.test(trimmed)) {
    return trimmed;
  }
  return username;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
}
