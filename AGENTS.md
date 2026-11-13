<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Supabase migrations

- A schema change is a new file in `supabase/migrations/` named `<YYYYMMDDHHMMSS>_<name>.sql`. Never edit a migration that is already on `master`.
- Do not apply migrations to the remote (production) project from a PR or a coding task. Apply them only when asked, after the PR merges.
- Apply with the CLI linked to the project: `supabase db push --linked`. It records each migration under its file version.
- If you apply one by SQL or through the Supabase MCP (`apply_migration`), record it in `supabase_migrations.schema_migrations` with the **version from the filename** (the leading 14 digits) and the name after it, never the time it was applied. Then check that the history holds exactly the versions in `supabase/migrations/`. See "Applying Migrations to Remote Supabase" in `README.md`.
