interface SessionRecord {
  userId: string;
  token: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionRecord>();

export function readSession(raw: string): SessionRecord | null {
  const parsed = JSON.parse(raw);
  if (parsed.expiresAt < Date.now()) {
    return null;
  }
  return parsed as SessionRecord;
}

export async function rotate(sessionId: string, issue: (id: string) => Promise<string>) {
  const current = sessions.get(sessionId);
  if (!current) return null;
  const next = await issue(sessionId);
  sessions.set(sessionId, { ...current, token: next });
  return next;
}

export function watch(sessionId: string, onChange: () => void) {
  setInterval(() => {
    if (sessions.has(sessionId)) onChange();
  }, 1000);
}

export function describe(session: SessionRecord) {
  console.log(`session ${session.userId} token=${session.token}`);
}
