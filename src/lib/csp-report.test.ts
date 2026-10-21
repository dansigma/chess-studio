import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_REPORTS_PER_REQUEST,
  cspReportFormat,
  formatCspReportLog,
  parseCspReports,
} from "./csp-report.ts";

describe("cspReportFormat", () => {
  it("recognizes both report content types, ignoring parameters and case", () => {
    assert.equal(cspReportFormat("application/csp-report"), "csp-report");
    assert.equal(cspReportFormat("Application/Reports+JSON; charset=utf-8"), "reports+json");
  });

  it("rejects anything else", () => {
    assert.equal(cspReportFormat(null), null);
    assert.equal(cspReportFormat("application/json"), null);
    assert.equal(cspReportFormat("text/plain"), null);
  });
});

describe("parseCspReports", () => {
  it("parses a report-uri body, keeping only host and path", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://xadrez.digital/courses/abc?token=secret",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?q=1",
        disposition: "report",
      },
    });
    assert.deepEqual(parseCspReports("csp-report", body), [
      { directive: "script-src-elem", blocked: "evil.example", path: "/courses/abc", disposition: "report" },
    ]);
  });

  it("falls back to the first word of violated-directive", () => {
    const body = JSON.stringify({
      "csp-report": { "violated-directive": "img-src 'self' data:", "blocked-uri": "inline" },
    });
    const [report] = parseCspReports("csp-report", body) ?? [];
    assert.equal(report?.directive, "img-src");
    assert.equal(report?.blocked, "inline");
    assert.equal(report?.path, "-");
  });

  it("parses Reporting API batches and skips other report types", () => {
    const body = JSON.stringify([
      { type: "deprecation", body: { id: "x" } },
      {
        type: "csp-violation",
        url: "https://xadrez.digital/studio",
        body: {
          documentURL: "https://xadrez.digital/studio",
          effectiveDirective: "frame-src",
          blockedURL: "https://www.youtube.com/embed/1",
          disposition: "enforce",
        },
      },
      { type: "csp-violation", url: "https://xadrez.digital/login", body: { effectiveDirective: "img-src", blockedURL: "data" } },
    ]);
    assert.deepEqual(parseCspReports("reports+json", body), [
      { directive: "frame-src", blocked: "www.youtube.com", path: "/studio", disposition: "enforce" },
      { directive: "img-src", blocked: "data", path: "/login", disposition: "report" },
    ]);
  });

  it("caps the number of reports taken from one batch", () => {
    const entry = { type: "csp-violation", body: { effectiveDirective: "img-src", blockedURL: "https://a.example/" } };
    const body = JSON.stringify(Array.from({ length: MAX_REPORTS_PER_REQUEST + 5 }, () => entry));
    assert.equal(parseCspReports("reports+json", body)?.length, MAX_REPORTS_PER_REQUEST);
  });

  it("reduces non-http blocked URIs to their scheme", () => {
    const body = JSON.stringify({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "blob:https://x/1" } });
    assert.equal(parseCspReports("csp-report", body)?.[0]?.blocked, "blob");
  });

  it("strips whitespace and control characters so a report cannot forge log lines", () => {
    const body = JSON.stringify({
      "csp-report": { "effective-directive": "img-src\ncsp-report enforce directive=fake", "blocked-uri": "eval x\r\ny" },
    });
    const [report] = parseCspReports("csp-report", body) ?? [];
    assert.ok(report);
    const line = formatCspReportLog(report);
    assert.ok(!/[\r\n]/.test(line));
    assert.equal(report.directive, "img-src");
    assert.equal(report.blocked, "evalxy");
  });

  it("truncates long values", () => {
    const body = JSON.stringify({ "csp-report": { "effective-directive": "x".repeat(5000) } });
    assert.equal(parseCspReports("csp-report", body)?.[0]?.directive.length, 100);
  });

  it("returns null for malformed or wrongly shaped bodies", () => {
    assert.equal(parseCspReports("csp-report", "not json"), null);
    assert.equal(parseCspReports("csp-report", "[]"), null);
    assert.equal(parseCspReports("csp-report", JSON.stringify({ "csp-report": "x" })), null);
    assert.equal(parseCspReports("reports+json", JSON.stringify({ type: "csp-violation" })), null);
  });
});

describe("formatCspReportLog", () => {
  it("prints one compact line", () => {
    assert.equal(
      formatCspReportLog({ directive: "img-src", blocked: "a.example", path: "/x", disposition: "report" }),
      "csp-report report directive=img-src blocked=a.example path=/x",
    );
  });
});
