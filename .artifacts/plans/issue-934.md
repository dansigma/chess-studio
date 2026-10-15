# Implementation Plan - SIG-934: DevOps: extend CI with migration validation and build cache

## Goal
Extend `.github/workflows/ci.yml` to prevent broken database migrations from reaching staging or production by applying all migrations from zero in a dedicated Supabase CI job, accelerate pull-request builds by restoring and caching `.next/cache` with `actions/cache@v4`, and cancel redundant in-flight workflow runs on PRs via top-level workflow concurrency.

## Scope
- **In scope**:
  - Add top-level `concurrency` configuration in `.github/workflows/ci.yml` with `cancel-in-progress` enabled for pull requests.
  - Add an `actions/cache@v4` step to the `ci` job in `.github/workflows/ci.yml` targeting `.next/cache` keyed on `package-lock.json` and TypeScript/JavaScript sources.
  - Add a dedicated `migrations` job in `.github/workflows/ci.yml` using `supabase/setup-cli@v1` that invokes `supabase start` and `supabase migration list` to test all 14 migrations sequentially against a local Supabase PostgreSQL container with the `auth` schema preconfigured.
  - Generate and check in `supabase/config.toml` (project ID `chess-studio`) required by the Supabase CLI.
  - Preserve existing static RLS assertions in `src/lib/supabase/rls-contract.test.ts` executed during `npm test`.
  - Validate YAML formatting, types (`npx tsc --noEmit`), unit tests (`npm test`), and production build (`npm run build`).
- **Out of scope**:
  - Automated deployment pipelines (deployments remain manual per release policy).
  - Modifying migration SQL scripts or database schema definitions.
  - Requiring live Supabase credentials for `next build` (`isSupabaseConfigured` guard remains intact).
  - Dependency audit changes (already handled in SIG-925).

## Phases

### Phase 1: Initialize Supabase CLI Configuration (`supabase/config.toml`)
- **Files**:
  - `supabase/config.toml`
- **Changes**:
  - Create `supabase/config.toml` configured for `chess-studio` (Postgres major version 17, default API and DB ports, pooler disabled, health timeout 2m).
  - Note: `supabase/.temp/` is already ignored in `.gitignore` (line 57).
- **Verification**:
  - Verify `supabase/config.toml` is present and valid TOML.
  - Verify that existing migrations in `supabase/migrations/` remain untouched.

### Phase 2: Add Concurrency and Next.js Build Caching to `.github/workflows/ci.yml`
- **Files**:
  - `.github/workflows/ci.yml`
- **Changes**:
  - Add top-level concurrency block:
    ```yaml
    concurrency:
      group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
      cancel-in-progress: ${{ github.event_name == 'pull_request' }}
    ```
  - In job `ci`, add `actions/cache@v4` step immediately prior to `npm run build`:
    ```yaml
          - name: Restore Next.js build cache
            uses: actions/cache@v4
            with:
              path: ${{ github.workspace }}/.next/cache
              key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**.[jt]s', '**.[jt]sx') }}
              restore-keys: |
                ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
    ```
- **Verification**:
  - Inspect YAML indentation and syntax.
  - Confirm cache path matches Next.js build output directory (`.next/cache`).

### Phase 3: Add Parallel `migrations` Job to `.github/workflows/ci.yml`
- **Files**:
  - `.github/workflows/ci.yml`
- **Changes**:
  - Add `migrations` job running on `ubuntu-latest`:
    ```yaml
      migrations:
        runs-on: ubuntu-latest
        permissions:
          contents: read
        steps:
          - name: Checkout
            uses: actions/checkout@v4

          - name: Set up Supabase CLI
            uses: supabase/setup-cli@v1
            with:
              version: latest

          - name: Start local Supabase and apply migrations
            run: supabase start

          - name: Verify migration status
            run: supabase migration list
    ```
  - `supabase start` boots PostgreSQL, initializes the `auth` schema, and applies all 14 files in `supabase/migrations/` in chronological order from zero. If any migration contains syntax errors, out-of-order column/table references, or constraint violations, the job will fail.
  - `supabase migration list` outputs migration status for CI auditability.
- **Verification**:
  - Verify job definition runs independently of `ci` and `e2e` (in parallel).
  - Confirm `supabase/setup-cli@v1` and `supabase start` commands match Supabase GitHub Actions standards.

### Phase 4: Local Verification and Gate Checks
- **Changes**: None (verification only).
- **Verification**:
  - Validate `.github/workflows/ci.yml` syntax.
  - Run `npm test` to ensure all 708 tests (including `src/lib/supabase/rls-contract.test.ts`) pass.
  - Run `npm run lint` and `npx tsc --noEmit`.
  - Run `npm run build` with `NEXT_ALIAS_WORKERD_STUB=1` to verify build succeeds without Supabase environment variables.

## Risks and Mitigations
- **Risk**: `supabase start` in CI takes significant time to pull Docker images.
  - **Mitigation**: The `migrations` job runs in parallel with the `ci` (test/lint/build) and `e2e` jobs, preventing it from adding sequential latency to CI overall wall-clock time.
- **Risk**: Next.js build cache caching full `.next/` directory instead of `.next/cache` might cause stale server bundles or broken manifests.
  - **Mitigation**: Specifically restrict the cache path to `${{ github.workspace }}/.next/cache` per official Vercel/Next.js recommendations.
- **Risk**: In-flight runs on the default branch (`master`) could be unintentionally cancelled on rapid pushes.
  - **Mitigation**: Restrict `cancel-in-progress` to `github.event_name == 'pull_request'` so pushes to `master` always run to completion.
- **Risk**: Migrations referencing the Supabase `auth` schema (`private.handle_new_user` trigger on `auth.users`, role `supabase_auth_admin`) fail on plain Postgres.
  - **Mitigation**: Use official Supabase CLI (`supabase start`) in CI, which sets up the complete Supabase Postgres environment with GoTrue/auth schemas and roles pre-populated.

## Considered and Rejected Alternatives
- **Plain PostgreSQL Service Container (`postgres:17`)**: Rejected because migration `20260928210000_profiles_and_admins.sql` defines triggers on `auth.users` and grants privileges to `supabase_auth_admin`. A plain Postgres image lacks these extensions, schemas, and roles, causing migrations to fail unless mocked.
- **Serializing Migration Validation into the `ci` Job**: Rejected because running Docker and Supabase CLI inside the Node test/build job would prolong feedback for quick lint or typecheck failures. Running a dedicated parallel `migrations` job keeps CI modular and fast.
- **Rewriting `rls-contract.test.ts` to Connect to Live DB**: Rejected because `rls-contract.test.ts` provides valuable sub-second static regex contract validation as part of standard unit tests (`npm test`) without requiring Docker/Postgres locally. Real database execution is handled by `supabase start` in the `migrations` job.

## Assumptions
- Supabase CLI version `latest` via `supabase/setup-cli@v1` is stable and standard for GitHub Actions.
- Local Supabase configuration `supabase/config.toml` uses default project ID `chess-studio` and Postgres version 17.
- Parallel job execution in GitHub Actions provides optimal wall-clock latency.
- Supabase environment variables are not required for Next.js build due to `isSupabaseConfigured()` guard.

## Open Questions
None. All design forks have been resolved based on codebase conventions and requirements.
