import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAudit } from "./audit-gate.mjs";

function auditWith(advisories) {
  const vulnerabilities = {};
  for (const advisory of advisories) {
    vulnerabilities[advisory.pkg] = {
      nodes: [`node_modules/${advisory.pkg}`],
      via: [
        `${advisory.pkg}-parent`,
        {
          url: `https://github.com/advisories/${advisory.id}`,
          severity: advisory.severity,
          title: advisory.title ?? advisory.id,
        },
      ],
    };
  }
  return { vulnerabilities };
}

const HIGH = {
  pkg: "some-pkg",
  id: "GHSA-aaaa-bbbb-cccc",
  severity: "high",
};
const CRITICAL = {
  pkg: "other-pkg",
  id: "GHSA-dddd-eeee-ffff",
  severity: "critical",
};
const MODERATE = {
  pkg: "third-pkg",
  id: "GHSA-gggg-hhhh-iiii",
  severity: "moderate",
};

function entry(id, expires = "2027-01-22") {
  return { id, reason: "test entry", expires };
}

test("allowlisted high advisory passes", () => {
  const { blocking } = evaluateAudit(
    auditWith([HIGH]),
    [entry(HIGH.id)],
    new Date("2026-10-24T00:00:00Z"),
  );
  assert.deepEqual(blocking, []);
});

test("unlisted high advisory fails", () => {
  const { blocking } = evaluateAudit(
    auditWith([HIGH]),
    [],
    new Date("2026-10-24T00:00:00Z"),
  );
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].id, HIGH.id);
});

test("expired allowlist entry fails", () => {
  const result = evaluateAudit(
    auditWith([HIGH]),
    [entry(HIGH.id, "2026-01-01")],
    new Date("2026-10-24T00:00:00Z"),
  );
  assert.equal(result.blocking.length, 1);
  assert.equal(result.blocking[0].id, HIGH.id);
  assert.equal(result.expired.length, 1);
  assert.equal(result.expired[0].id, HIGH.id);
});

test("critical fails unless allowlisted", () => {
  const now = new Date("2026-10-24T00:00:00Z");
  const unlisted = evaluateAudit(auditWith([CRITICAL]), [], now);
  assert.equal(unlisted.blocking.length, 1);
  const listed = evaluateAudit(auditWith([CRITICAL]), [entry(CRITICAL.id)], now);
  assert.deepEqual(listed.blocking, []);
});

test("moderate never fails", () => {
  const { blocking } = evaluateAudit(
    auditWith([MODERATE]),
    [],
    new Date("2026-10-24T00:00:00Z"),
  );
  assert.deepEqual(blocking, []);
});

test("stale allowlist entries are reported without failing", () => {
  const result = evaluateAudit(
    auditWith([MODERATE]),
    [entry("GHSA-zzzz-yyyy-xxxx")],
    new Date("2026-10-24T00:00:00Z"),
  );
  assert.deepEqual(result.blocking, []);
  assert.equal(result.stale.length, 1);
});
