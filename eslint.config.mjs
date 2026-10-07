import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "public/engine/**",
    "chess-studio/**",
    // vinext / Cloudflare build outputs (gitignored; not source):
    ".cloudflare/**",
    ".vinext/**",
    "dist/**",
    // Nested worktrees (e.g. .worktrees/poc-vinext/.cloudflare/output) are not
    // covered by the patterns above; never lint generated code inside them.
    ".worktrees/**",
  ]),
]);

export default eslintConfig;
