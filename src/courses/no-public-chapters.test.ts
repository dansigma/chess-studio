// SIG-1120: no public/session-client query may read courses.chapters (or
// select * from courses): after the column-grant revocation such a query
// fails with permission denied. Service-role reads in publish.ts stay
// allowlisted (gate.admin.from("courses")).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") {
        continue;
      }
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

// A query counts as service-role when the same file drives it through the
// service client (gate.admin) or the server admin helper.
function isServiceRoleCallSite(source: string, index: number): boolean {
  const windowStart = Math.max(0, index - 2000);
  const before = source.slice(windowStart, index);
  return /gate\.admin\s*\.\s*from\s*\(\s*["']courses["']\s*\)/.test(source.slice(index, index + 400)) ||
    /createServiceSupabase|createAdminSupabase|service_role/.test(before);
}

describe("sig-1120 no public chapters reads", () => {
  it("fails if a non-service-role query selects chapters or * from courses", () => {
    const violations: string[] = [];
    for (const file of [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app"))]) {
      const source = readFileSync(file, "utf8");
      const fromRe = /\.from\s*\(\s*["']courses["']\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = fromRe.exec(source)) !== null) {
        if (isServiceRoleCallSite(source, match.index)) {
          continue;
        }
        const after = source.slice(match.index, match.index + 1200);
        const selectMatch = after.match(/\.select\s*\(\s*([^)]*)\)/);
        if (!selectMatch) {
          continue;
        }
        const cols = selectMatch[1];
        if (/(^|["'`\s,])\*(["'`\s,]|$)/.test(cols)) {
          violations.push(`${file}: selects * from courses`);
        }
        if (cols.split(",").some((col) => col.replace(/["'`\s]/g, "") === "chapters")) {
          violations.push(`${file}: selects chapters from courses`);
        }
      }
    }
    assert.deepEqual(violations, [], "public-client chapters reads must go through course_content");
  });

  it("keeps the canonical public select list free of chapters", () => {
    const catalog = readFileSync(join(ROOT, "src/courses/catalog.ts"), "utf8");
    const fields = catalog.match(/COURSE_SELECT_FIELDS\s*=\s*"([^"]*)"/);
    assert.ok(fields, "missing COURSE_SELECT_FIELDS");
    const cols = fields![1].split(",").map((col) => col.trim());
    assert.ok(!cols.includes("chapters"), "COURSE_SELECT_FIELDS must not include chapters");
    assert.ok(cols.includes("outline"), "COURSE_SELECT_FIELDS must include outline");
  });
});
