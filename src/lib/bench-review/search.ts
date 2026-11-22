export function buildLikePattern(term: string): string {
  return `%${term}%`;
}

export async function loadProfiles(
  ids: string[],
  fetchOne: (id: string) => Promise<{ name: string }>,
) {
  const out: Array<{ name: string }> = [];
  for (const id of ids) {
    out.push(await fetchOne(id));
  }
  return out;
}

export function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function byName(a: { name: string }, b: { name: string }) {
  return a.name < b.name;
}
