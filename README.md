# Chess Studio

Modern chess analysis GUI and course platform featuring interactive board analysis, Stockfish evaluation, notation tree, Lichess opening explorer, opening database, and course creation.

## Requirements

- **Node.js**: `>= 22` (see `.nvmrc` and `engines` in `package.json`)
- **Package Manager**: `npm` (compatible with modern npm versions bundled with Node 22)
- **Optional CLI Tools**:
  - [Supabase CLI](https://supabase.com/docs/guides/cli) for local database and migration testing
  - [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`wrangler`) for R2 asset and Workers management

## Quickstart

```bash
# 1. Ensure you are on Node 22
nvm use

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Guest Mode**: Guest mode works out-of-the-box without Supabase or external tokens. You can play moves, run the Stockfish engine, import and export PGNs, and browse the built-in master sample opening book.

## Environment Variables

Copy `.env.example` to `.env.local` to configure environment variables:

```bash
cp .env.example .env.local
```

| Variable | Scope | Required / Optional | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | Required in production (if using Supabase) | Supabase project URL (e.g. `https://your-project.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client & Server | Required in production (if using Supabase) | Supabase publishable/anon key used by client-side browser requests. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | Optional fallback | Backward-compatibility alias for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. |
| `NEXT_PUBLIC_SITE_URL` | Client & Server | Required in production | Canonical base URL used for auth email redirects (signup confirmation, password reset), e.g. `https://your-app.example`. In local development, falls back to the request `Origin` header or `http://localhost:3000`. Must be set at build time as it is inlined into client bundles. |
| `SUPABASE_URL` | Server-only | Optional | Supabase project URL read by `@supabase/server`. If unset, defaults to `NEXT_PUBLIC_SUPABASE_URL`. |
| `SUPABASE_PUBLISHABLE_KEY` | Server-only | Optional | Supabase key read by `@supabase/server`. If unset, defaults to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. |
| `SUPABASE_SECRET_KEY` | Server-only | Required for course publishing | Secret/service role key for administrative server actions (e.g. publishing courses). Never expose to the client or prefix with `NEXT_PUBLIC_`. |
| `COURSE_ADMINS` | Server-only | Optional | Comma-separated list of email addresses permitted to create and publish courses (e.g. `admin@example.com,coach@example.com`). Also validated against `public.course_admins`. |
| `SUPABASE_JWKS_URL` | Server-only | Optional | Supabase auth JWKS endpoint for JWT verification (e.g. `https://your-project.supabase.co/auth/v1/.well-known/jwks.json`). |
| `LICHESS_TOKEN` | Server / Client | Optional | Personal OAuth token from [lichess.org/account/oauth/token](https://lichess.org/account/oauth/token) (no scopes required). Without it, live Lichess explorer stats return 401 and the app falls back to the built-in master sample book. |
| `RESEND_API_KEY` | Server-only | Optional | Resend API key for transactional email (coach invites, receipts, reminders). Without it, `sendEmail()` is a no-op that logs once and returns `{ ok: false, reason: "not_configured" }`. |
| `EMAIL_FROM` | Server-only | Optional | Override for the email sender identity. Defaults to `"Xadrez Digital" <no-reply@xadrez.digital>`. |
| `EMAIL_REPLY_TO` | Server-only | Optional | Override for the email reply-to address. Defaults to `contato@xadrez.digital`. |

## Supabase & Database Migrations

Chess Studio uses Supabase for user authentication, saved boards, custom repertoires, puzzle training progress, and courses.

### Auth Setup & Security Note
In the Supabase Dashboard under **Authentication -> Providers -> Email**, ensure that **Confirm email** is enabled (local dev: `enable_confirmations = true` in `supabase/config.toml`). This prevents unconfirmed signups from claiming allowlisted administrator addresses configured in `COURSE_ADMINS`. The admin role is granted only to confirmed allowlisted emails and is revoked at the next sign-in if the email is removed from the allowlist.

### Applying Migrations Locally
All database schemas, RLS policies, and triggers are tracked sequentially under `supabase/migrations/`:

1. Start the local Supabase stack:
   ```bash
   supabase start
   ```
2. Verify migration status:
   ```bash
   supabase migration list --local
   ```
3. Check table Row Level Security (RLS) enforcement:
   ```bash
   supabase db query --local "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
   ```

### Applying Migrations to Remote Supabase
If applying migrations to a hosted Supabase project without the CLI, execute all SQL scripts in `supabase/migrations/` sequentially in chronological order via the Supabase SQL editor:
- `20260317120000_init_studio.sql` (initial schema, user profiles, saved boards, opening databases)
- `20260918003000_files_write_policies.sql` (file and directory write policies)
- `20260918120000_player_bookmarks.sql` (player bookmarks)
- `20260921120000_position_index_policies.sql` (position index RLS policies)
- `20260928170000_courses.sql` (courses, chapters, and enrollment)
- `20260928200000_course_media.sql` (course media attachments)
- `20260928210000_profiles_and_admins.sql` (profile admin flags and `course_admins` table)
- `20260928220000_course_theme.sql` (course theme styling options)
- `20260930120000_explorer_cache_lock_writes.sql` (cache lock writes)
- `20261002120000_game_positions_seq_pk.sql` (game position primary keys)
- `20261005120000_puzzle_progress.sql` (puzzle solving progress and streaks)
- `20261007120000_sig861_rls_indexes_drafts.sql` (RLS index optimizations and course drafts)
- `20261013000000_nested_folders.sql` (hierarchical folder structure for saved games)
- `20261013120000_repertoire_progress.sql` (opening repertoire training progress)
- `20261021250000_puzzles.sql` (curated Lichess puzzle subset table, read-only for clients)

## Puzzle dataset

The trainer's large puzzle pool comes from the [Lichess open database](https://database.lichess.org/#puzzles) (CC0 — no rights reserved; thanks to Lichess and its players for publishing millions of rated puzzles). The raw `lichess_db_puzzle.csv.zst` is never committed; instead a curated subset (~60,000 puzzles, popularity ≥ 85, ≥ 500 plays, balanced by 100-point rating band and theme) is built and loaded into `public.puzzles`:

```bash
# 1. Download + decompress the upstream dump, then build the subset
node scripts/lichess-puzzles/build-subset.mjs lichess_db_puzzle.csv puzzles-subset.csv --size 60000

# 2. Load into the database (after SIG-1102 is deployed)
\copy public.puzzles(id,fen,moves,rating,themes,popularity,nb_plays) from 'puzzles-subset.csv' csv header
```

Only Lichess theme tags that map onto the app's 13 themes (see `scripts/lichess-puzzles/map-themes.mjs`) are kept; the rest of the import rules (first-move application, SAN conversion, balancing) are covered by the 12-row fixture in `scripts/lichess-puzzles/fixtures/`.

## Stockfish Engine Architecture

The application supports two Stockfish 19 engine builds:

1. **Stockfish 19 lite (Default)**:
   - Files: `public/engine/stockfish-lite.wasm` (~1.6 MB) and `public/engine/stockfish.wasm` (~1.8 MB).
   - Bundled with the repository and used by default for local development, tests, and standard analysis.
2. **Stockfish 19 full (NNUE)**:
   - Files: `stockfish-19-single.wasm` and `full/stockfish-19.wasm` (~95 MB each).
   - Because Cloudflare Workers static assets have a 25 MiB file size limit, full WASM binaries are **not** committed to git or bundled in static assets. Instead, in production they are served dynamically from the Cloudflare R2 bucket `chess-studio-engine` via `app/engine/[...path]/route.ts`.
   - `public/engine/full/stockfish.worker.js` looks like a duplicate of `stockfish-19.js` but must stay next to it: the threaded build spawns its pthread workers by that filename (guarded by `src/engine/engine-assets.test.ts`).

### Local Development with Full Engine (Optional)
Local development works out-of-the-box with the bundled lite engine. To test the full NNUE engine locally:

```bash
npx wrangler r2 object get chess-studio-engine/engine/stockfish-19-single.wasm --file public/engine/stockfish-19-single.wasm
npx wrangler r2 object get chess-studio-engine/engine/full/stockfish-19.wasm --file public/engine/full/stockfish-19.wasm
```

*(These binaries are listed in `.gitignore` and must remain untracked).*

### Uploading Engine Builds to Cloudflare R2
To publish or update the full WASM binaries in the `chess-studio-engine` bucket:

```bash
npx wrangler r2 object put chess-studio-engine/engine/stockfish-19-single.wasm --file <path-to-wasm> --content-type application/wasm
npx wrangler r2 object put chess-studio-engine/engine/full/stockfish-19.wasm --file <path-to-wasm> --content-type application/wasm
```

## Testing & Code Quality

Run tests and verification commands locally before committing or deploying:

```bash
# Run unit and integration tests (Node test runner with resolve mocks)
npm test

# Run ESLint check
npm run lint

# Run TypeScript compiler check
npx tsc --noEmit

# Run Playwright end-to-end smoke tests
npm run test:e2e
```

## Dependency audit

Production dependencies are audited on every CI run by `node scripts/audit-gate.mjs`
(fails on any unallowlisted `high`/`critical` advisory from `npm audit --omit=dev`).
Advisories with no usable fix are listed in `audit-allowlist.json` with a reason
and an `expires` date (90 days out); expired entries fail the gate, and stale
entries (matching no current advisory) are printed so they can be removed:

```bash
node scripts/audit-gate.mjs
```

Dependabot covers npm updates weekly. When an allowlist entry nears expiry,
check whether an upgrade fixes it, then renew or remove the entry.

## Build & Deployment

### 1. Next.js Standard Build
Build for standard Node.js / containerized environments:

```bash
npm run build
npm run start
```
*(Note: `npm run build` runs with `NEXT_ALIAS_WORKERD_STUB=1` to shim Cloudflare runtime bindings during static analysis).*

### 2. Cloudflare Workers / Vinext Deploy
The production deployment on Cloudflare Workers uses [`vinext`](https://github.com/cloudflare/vinext) (`@vinext/cloudflare`):

- **Local Vinext Dev Server**:
  ```bash
  npm run dev:vinext
  ```
  Runs Vite dev server configured for Workers runtime on port 3001.

- **Build Vinext Worker Bundle**:
  ```bash
  npm run build:vinext
  ```

- **Preview Vinext Worker Locally**:
  ```bash
  npm run start:vinext
  ```

- **Deploy to Cloudflare Workers**:
  ```bash
  npm run deploy:vinext
  ```
  This command invokes `scripts/vinext-deploy.mjs`. It verifies that full engine WASM files (~95 MB) are not accidentally present in `public/engine/` (which would breach Cloudflare's 25 MiB asset limit), and runs `vinext-cloudflare deploy`.

#### Cloudflare Worker Bindings (`cloudflare.config.ts`)
- `ASSETS`: Static asset binding.
- `ENGINE`: Cloudflare R2 bucket `chess-studio-engine` for dynamic Stockfish NNUE WASM streaming.
- `VINEXT_KV_CACHE`: Cloudflare KV namespace for ISR page data caching.
- `RL_60_MIN`, `RL_30_MIN`, `RL_AUTH`: Edge-enforced rate limiting bindings.

## Stack

- **Framework**: [Next.js](https://nextjs.org/) + [React 19](https://react.dev/) + [Vinext](https://github.com/cloudflare/vinext) (Cloudflare Workers)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Chess Board & Logic**: [`react-chessboard`](https://github.com/Clariity/react-chessboard) + [`chess.js`](https://github.com/jhlywa/chess.js) + Stockfish 19
- **Layout**: [`dockview-react`](https://dockview.dev/)
- **Rich Text Editing**: [TipTap](https://tiptap.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Backend / Database**: [Supabase](https://supabase.com/) (Auth, PostgreSQL, Row-Level Security)
