/**
 * Parsing for CSP violation reports (SIG-1054), kept free of `next/server` so it is unit-testable.
 *
 * Browsers send one of two formats:
 * - `application/csp-report` (the `report-uri` directive): `{ "csp-report": { "violated-directive", ... } }`;
 * - `application/reports+json` (the Reporting API, `report-to`): an array of
 *   `{ type: "csp-violation", url, body: { effectiveDirective, blockedURL, documentURL, ... } }`.
 *
 * Reports are attacker-controllable input, so only a few fields are kept, each reduced to a short,
 * printable token: the directive, the blocked host (never the full URL), and the document path
 * (never the query string, which can carry tokens).
 */

export const CSP_REPORT_PATH = "/api/csp-report";
export const CSP_REPORT_GROUP = "csp-endpoint";
/** Largest body accepted; a real report is well under 4 KB, and the Reporting API batches a few. */
export const MAX_CSP_REPORT_BYTES = 64 * 1024;
/** At most this many reports from one request are logged. */
export const MAX_REPORTS_PER_REQUEST = 20;

export type CspReportFormat = "csp-report" | "reports+json";

export type CspViolationSummary = {
  directive: string;
  blocked: string;
  path: string;
  disposition: "enforce" | "report";
};

const MAX_TOKEN = 100;

/** Maps a Content-Type header to a supported report format, or null. */
export function cspReportFormat(contentType: string | null): CspReportFormat | null {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime === "application/csp-report") {
    return "csp-report";
  }
  if (mime === "application/reports+json") {
    return "reports+json";
  }
  return null;
}

/** Keeps a short run of printable, non-space ASCII so a report cannot forge or split log lines. */
function token(value: unknown, fallback = "-"): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.replace(/[^\x21-\x7e]/g, "").slice(0, MAX_TOKEN);
  return cleaned || fallback;
}

/** "https://cdn.example/x.js?a=1" → "cdn.example"; keywords such as "inline", "eval", "data" pass through. */
function blockedHost(value: unknown): string {
  if (typeof value !== "string" || value === "") {
    return "-";
  }
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "ws:" || url.protocol === "wss:") {
      return token(url.host);
    }
    return token(url.protocol.replace(/:$/, ""));
  } catch {
    return token(value);
  }
}

function documentPath(value: unknown): string {
  if (typeof value !== "string") {
    return "-";
  }
  try {
    return token(new URL(value).pathname);
  } catch {
    return "-";
  }
}

function summarize(
  directive: unknown,
  blocked: unknown,
  documentUrl: unknown,
  disposition: unknown,
): CspViolationSummary {
  // Older browsers send only `violated-directive`, which may carry the whole directive value.
  const name = typeof directive === "string" ? directive.trim().split(/\s+/)[0] : undefined;
  return {
    directive: token(name),
    blocked: blockedHost(blocked),
    path: documentPath(documentUrl),
    disposition: disposition === "enforce" ? "enforce" : "report",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a report body; returns null when it is not JSON of the expected shape. */
export function parseCspReports(format: CspReportFormat, text: string): CspViolationSummary[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  if (format === "csp-report") {
    const report = isRecord(data) ? data["csp-report"] : undefined;
    if (!isRecord(report)) {
      return null;
    }
    return [
      summarize(
        report["effective-directive"] ?? report["violated-directive"],
        report["blocked-uri"],
        report["document-uri"],
        report.disposition,
      ),
    ];
  }

  if (!Array.isArray(data)) {
    return null;
  }
  const summaries: CspViolationSummary[] = [];
  for (const entry of data) {
    if (summaries.length >= MAX_REPORTS_PER_REQUEST) {
      break;
    }
    if (!isRecord(entry) || entry.type !== "csp-violation" || !isRecord(entry.body)) {
      continue;
    }
    const body = entry.body;
    summaries.push(
      summarize(body.effectiveDirective, body.blockedURL, body.documentURL ?? entry.url, body.disposition),
    );
  }
  return summaries;
}

export function formatCspReportLog(summary: CspViolationSummary): string {
  return `csp-report ${summary.disposition} directive=${summary.directive} blocked=${summary.blocked} path=${summary.path}`;
}
