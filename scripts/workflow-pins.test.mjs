import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// Guards the CI supply chain: every `uses:` in .github/workflows must be pinned
// to a full 40-char commit SHA with the human-readable tag in a trailing comment
// (the format Dependabot needs to propose updates), and no step may install the
// Supabase CLI with `version: latest`.
const WORKFLOWS_DIR = path.join(process.cwd(), ".github", "workflows");

test("workflow pins: every uses: is a SHA with a version comment, no latest", () => {
  const files = readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
  assert.ok(files.length > 0, `no workflow files found in ${WORKFLOWS_DIR}`);

  const violations = [];
  for (const file of files) {
    const lines = readFileSync(path.join(WORKFLOWS_DIR, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      const stripped = line.split("#")[0];
      if (/\buses:\s*\S+/.test(stripped)) {
        if (!/\buses:\s*\S+@[0-9a-f]{40}\b/.test(stripped)) {
          violations.push(`${file}:${index + 1}: unpinned uses: (expected @<40-char-sha>)`);
        } else if (!/#\s*v\d/i.test(line)) {
          violations.push(`${file}:${index + 1}: pinned uses: lacks a version comment`);
        }
      }
      if (/version\s*:\s*['"]?latest['"]?/i.test(stripped)) {
        violations.push(`${file}:${index + 1}: version: latest is not allowed`);
      }
    });
  }
  assert.deepEqual(violations, []);
});
