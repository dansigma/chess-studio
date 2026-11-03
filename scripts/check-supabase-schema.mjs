#!/usr/bin/env node
// SIG-1188: production schema smoke probe. Reads NEXT_PUBLIC_SUPABASE_URL and
// the publishable key, probes the tables/columns the app needs with
// `select=*&limit=1` (never row data), and exits non-zero naming the exact
// failing object plus the PostgREST response. Fail-closed: missing env,
// network errors, and non-2xx responses all fail.
import process from "node:process";

export const PROBES = [
  { object: "linked_accounts", table: "linked_accounts", select: "*" },
  { object: "my_games", table: "my_games", select: "*" },
  { object: "puzzles", table: "puzzles", select: "*" },
  { object: "course_enrollments", table: "course_enrollments", select: "*" },
  { object: "boards.repertoire_color", table: "boards", select: "repertoire_color" },
];

export function getSchemaCheckEnv(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const key =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.SUPABASE_PUBLISHABLE_KEY;
  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return { url, key, missing };
}

export async function probeSchema({ url, key, fetchFn = fetch }) {
  const failures = [];
  for (const probe of PROBES) {
    const endpoint = `${url.replace(/\/$/, "")}/rest/v1/${probe.table}?select=${probe.select}&limit=1`;
    let res;
    try {
      res = await fetchFn(endpoint, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
    } catch (error) {
      failures.push({
        object: probe.object,
        status: "fetch_error",
        code: undefined,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (res.ok) continue;
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "<unreadable body>";
    }
    let code;
    let message = body;
    try {
      const parsed = JSON.parse(body);
      code = parsed.code;
      if (typeof parsed.message === "string") message = parsed.message;
    } catch {
      // Non-JSON body: keep the raw text as the message.
    }
    failures.push({ object: probe.object, status: res.status, code, message });
  }
  return failures;
}

function formatFailure(failure) {
  const code = failure.code ? ` code=${failure.code}` : "";
  return `missing or unreadable: ${failure.object} (status=${failure.status}${code}) message=${failure.message}`;
}

async function main() {
  const { url, key, missing } = getSchemaCheckEnv();
  if (missing.length > 0) {
    console.error(`check:schema misconfigured: missing ${missing.join(", ")}`);
    process.exit(1);
  }
  const failures = await probeSchema({ url, key });
  if (failures.length > 0) {
    for (const failure of failures) console.error(`check:schema ${formatFailure(failure)}`);
    process.exit(1);
  }
  console.log("check:schema ok: linked_accounts, my_games, puzzles, course_enrollments, boards.repertoire_color");
}

const invokedAsScript =
  process.argv[1] != null && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (invokedAsScript) {
  await main();
}
