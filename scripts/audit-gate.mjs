#!/usr/bin/env node
/**
 * Blocking dependency-audit gate for CI.
 *
 * Runs `npm audit --omit=dev --json`, collects every advisory (object entries
 * in each vulnerability's `via`, carrying `url` + `severity`), and fails when
 * any `high` or `critical` advisory is not covered by a non-expired entry in
 * `audit-allowlist.json`. Allowlist entries that match no current advisory are
 * reported as warnings so they can be removed. `moderate` and below never
 * block. The gate fails closed: an unreadable audit or allowlist fails.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ALLOWLIST_PATH = path.join(process.cwd(), "audit-allowlist.json");
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

export function advisoryIdFromUrl(url) {
  return String(url).split("/").pop();
}

/**
 * Collects advisories from parsed `npm audit --json` output.
 * Returns a Map keyed by advisory id: { id, url, severity, title, paths }.
 */
export function collectAdvisories(auditJson) {
  const advisories = new Map();
  const vulnerabilities = auditJson?.vulnerabilities ?? {};
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    const via = Array.isArray(entry?.via) ? entry.via : [];
    const nodes = Array.isArray(entry?.nodes) ? entry.nodes : [name];
    for (const item of via) {
      if (typeof item !== "object" || item === null) continue; // chain link
      if (!item.url || !item.severity) continue;
      const id = advisoryIdFromUrl(item.url);
      const existing = advisories.get(id);
      if (existing) {
        for (const node of nodes) {
          if (!existing.paths.includes(node)) existing.paths.push(node);
        }
        continue;
      }
      advisories.set(id, {
        id,
        url: item.url,
        severity: item.severity,
        title: item.title ?? "",
        paths: [...nodes],
      });
    }
  }
  return advisories;
}

function parseAllowlist(raw) {
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : (parsed.entries ?? []);
  return entries.map((entry) => ({
    id: entry.id,
    reason: entry.reason ?? "",
    expires: entry.expires ?? null,
  }));
}

function isExpired(entry, now) {
  if (!entry.expires) return false;
  return new Date(`${entry.expires}T23:59:59Z`).getTime() < now.getTime();
}

/**
 * Pure decision logic over a parsed audit JSON + allowlist entries.
 * Returns { blocking, expired, stale }.
 */
export function evaluateAudit(auditJson, allowlistEntries, now = new Date()) {
  const advisories = collectAdvisories(auditJson);
  const byId = new Map(allowlistEntries.map((entry) => [entry.id, entry]));
  const matched = new Set();

  const blocking = [];
  for (const advisory of advisories.values()) {
    if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue;
    const entry = byId.get(advisory.id);
    if (!entry || isExpired(entry, now)) {
      blocking.push(advisory);
    } else {
      matched.add(advisory.id);
    }
  }

  const expired = allowlistEntries.filter((entry) => isExpired(entry, now));
  const stale = allowlistEntries.filter(
    (entry) => !isExpired(entry, now) && !matched.has(entry.id),
  );
  return { blocking, expired, stale };
}

function main() {
  let auditJson;
  try {
    const output = execFileSync(
      "npm",
      ["audit", "--omit=dev", "--json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    auditJson = JSON.parse(output);
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    // npm exits non-zero when vulnerabilities are found but still prints JSON
    // on stdout; use it when parseable, otherwise fail closed.
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    if (stdout) {
      try {
        auditJson = JSON.parse(stdout);
      } catch {
        // fall through to the fatal error below
      }
    }
    if (!auditJson) {
      console.error(
        `[audit-gate] ERROR: could not run \`npm audit --omit=dev --json\`.${stderr ? ` npm said: ${stderr}` : ""}`,
      );
      process.exit(1);
    }
  }

  let allowlistEntries;
  try {
    allowlistEntries = parseAllowlist(readFileSync(ALLOWLIST_PATH, "utf8"));
  } catch (error) {
    console.error(
      `[audit-gate] ERROR: could not read ${ALLOWLIST_PATH}: ${error.message}`,
    );
    process.exit(1);
  }

  const { blocking, expired, stale } = evaluateAudit(
    auditJson,
    allowlistEntries,
    new Date(),
  );

  for (const entry of stale) {
    console.log(
      `[audit-gate] NOTE: allowlist entry ${entry.id} matches no current advisory and can be removed.`,
    );
  }

  let failed = false;
  for (const entry of expired) {
    console.error(
      `[audit-gate] BLOCKED: allowlist entry ${entry.id} expired on ${entry.expires} — renew or remove it.`,
    );
    failed = true;
  }
  for (const advisory of blocking) {
    console.error(
      `[audit-gate] BLOCKED: ${advisory.id} [${advisory.severity}] ${advisory.title} (${advisory.url}) via ${advisory.paths.join(", ")}.`,
    );
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }
  console.log("[audit-gate] OK: no unallowlisted high/critical advisories.");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
