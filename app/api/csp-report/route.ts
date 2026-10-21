import { NextRequest, NextResponse } from "next/server";
import {
  MAX_CSP_REPORT_BYTES,
  cspReportFormat,
  formatCspReportLog,
  parseCspReports,
} from "@/src/lib/csp-report";
import { clientIp, createRouteLimiter, rateLimitKey } from "@/src/lib/rate-limit";
import { readCapped, UpstreamPayloadTooLargeError } from "@/src/lib/read-capped";

// Browsers send reports in bursts (one per violation, or a batch), so the quota is generous;
// beyond it reports are dropped, which only loses telemetry.
const limiter = createRouteLimiter({ limit: 60, windowMs: 60_000, bindingName: "RL_60_MIN" });

/** Receives CSP violation reports (SIG-1054). Responses never echo the input. */
export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const verdict = await limiter.checkAsync(rateLimitKey("csp-report", ip));
  if (!verdict.ok) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(verdict.retryAfterSeconds) },
    });
  }

  const format = cspReportFormat(request.headers.get("content-type"));
  if (!format) {
    return new NextResponse(null, { status: 415 });
  }

  let text: string;
  try {
    text = await readCapped(request, MAX_CSP_REPORT_BYTES);
  } catch (error) {
    if (error instanceof UpstreamPayloadTooLargeError) {
      return new NextResponse(null, { status: 413 });
    }
    return new NextResponse(null, { status: 400 });
  }

  const reports = parseCspReports(format, text);
  if (!reports) {
    return new NextResponse(null, { status: 400 });
  }
  for (const report of reports) {
    console.warn(formatCspReportLog(report));
  }
  return new NextResponse(null, { status: 204 });
}
