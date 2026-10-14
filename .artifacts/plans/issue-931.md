# Implementation Plan - SIG-931: DevOps: remove 99 MB Stockfish WASM binaries from git

## Goal
Remove the two ~95 MB Stockfish WASM binaries (`public/engine/stockfish-19-single.wasm` and `public/engine/full/stockfish-19.wasm`) from git tracking, add them to `.gitignore`, simplify `scripts/vinext-deploy.mjs` by eliminating the `stashMove`/`restore` routine, document local engine setup and Cloudflare R2 upload procedures in `README.md`, and verify that `npm test`, `npm run build`, and `npm run build:vinext` all pass cleanly without the large binaries in the working tree.

## Scope
- **In scope**:
  - Untrack `public/engine/stockfish-19-single.wasm` and `public/engine/full/stockfish-19.wasm` (`git rm --cached`).
  - Add ignore patterns to `.gitignore` so local copies are never committed.
  - Simplify `scripts/vinext-deploy.mjs`: remove `stashMove()`, `restore()`, directory creation for `node_modules/.engine-stash`, and `try/finally` stash dance. Add a warning if large binaries are found in `public/` before invoking `vinext-cloudflare deploy`.
  - Update comments in `app/engine/[...path]/route.ts` and `cloudflare.config.ts` reflecting that large WASM files are not tracked in `public/`.
  - Document engine architecture, local development fallback, and R2 upload instructions in `README.md`.
  - Verify `npm test`, `npm run build`, and `npm run build:vinext`.
- **Out of scope**:
  - Rewriting git history via `git filter-repo` (explicitly optional in the issue, requires team agreement and coordination as it invalidates branches/clones).
  - Changing engine versions, build configurations, or UI logic.
  - Modifying `next.config.ts` or `public/_headers` COOP/COEP/CORP isolation headers.

## Phases

### Phase 1: Untrack Large WASM Binaries and Update `.gitignore`
- **Files**:
  - `public/engine/stockfish-19-single.wasm`
  - `public/engine/full/stockfish-19.wasm`
  - `.gitignore`
- **Changes**:
  - Stop tracking the two ~95 MB binaries using `git rm --cached public/engine/stockfish-19-single.wasm public/engine/full/stockfish-19.wasm`.
  - Delete local working copy binaries from `public/engine/` so a clean checkout state is simulated.
  - Add ignore entries to `.gitignore`:
    ```gitignore
    # large engine wasm binaries (served via Cloudflare R2 bucket chess-studio-engine)
    public/engine/stockfish-19-single.wasm
    public/engine/full/stockfish-19.wasm
    ```
- **Verification**:
  - Run `git status` to ensure files are marked as deleted in the git index and ignored if re-created.
  - Run `npm test` to verify route tests and client tests don't require the physical files.

### Phase 2: Simplify `scripts/vinext-deploy.mjs` and Update Route Comments
- **Files**:
  - `scripts/vinext-deploy.mjs`
  - `app/engine/[...path]/route.ts`
  - `cloudflare.config.ts`
- **Changes**:
  - In `scripts/vinext-deploy.mjs`:
    - Remove `stashMove()`, `restore()`, `node_modules/.engine-stash`, and `try/finally`.
    - Check if `public/engine/stockfish-19-single.wasm` or `public/engine/full/stockfish-19.wasm` exist in `public/`, and print a warning if detected (to alert developers who manually downloaded them).
    - Directly invoke `vinext-cloudflare deploy` with inherited stdio and exit code handling.
  - In `app/engine/[...path]/route.ts` and `cloudflare.config.ts`:
    - Update commentary to describe that full wasm binaries are not tracked in `public/` and are served via R2, removing outdated stash/restore references.
- **Verification**:
  - Run `node --check scripts/vinext-deploy.mjs` to verify syntax.
  - Verify `scripts/vinext-deploy.mjs` has no stash or restore logic.

### Phase 3: Document Engine Architecture and R2 Workflow in `README.md`
- **Files**:
  - `README.md`
- **Changes**:
  - Add `## Stockfish Engine` section explaining:
    - Default engine: Stockfish 19 lite (`public/engine/stockfish-lite.wasm` 1.6 MB, `public/engine/stockfish.wasm` 1.8 MB) bundled in `public/engine/`.
    - Full engine: Stockfish 19 (`stockfish-19-single.wasm` 95 MB and `stockfish-19.wasm` 95 MB) served via Cloudflare R2 bucket `chess-studio-engine` through `/engine/[...path]`.
    - Local development: Normal development uses the lite engine by default; to test the full engine offline, download the wasm binaries from R2 into `public/engine/` (ignored by git).
    - Uploading to R2: Commands using `wrangler r2 object put` to upload new wasm builds.
- **Verification**:
  - Inspect `README.md` formatting and clarity.

### Phase 4: Build, Test, and Integrity Verification
- **Changes**: None (verification only).
- **Verification**:
  - Run `npm test` (verify 708 tests pass).
  - Run `npm run build` (verify Next.js production build passes).
  - Run `npm run build:vinext` (verify Vite / Cloudflare Workers build passes).
  - Check `git diff` and `git status` to ensure clean changes and no unintended modifications.

## Risks and Mitigations
- **Risk**: A developer manually downloads the full WASM into `public/engine/` and runs deploy, which could trigger vinext asset upload limit.
  - **Mitigation**: `scripts/vinext-deploy.mjs` includes a warning detection if large engine binaries are present in `public/` before executing the deploy command.
- **Risk**: Deployed preview or production worker fails to resolve full engine if R2 binding or route changes.
  - **Mitigation**: `cloudflare.config.ts` `runWorkerFirst` rules and `app/engine/[...path]/route.ts` remain unchanged and covered by existing unit tests in `app/engine/[...path]/route.test.ts`.
- **Risk**: Breaking isolation headers.
  - **Mitigation**: `public/_headers` and `next.config.ts` COOP/COEP/CORP configurations are preserved untouched.

## Assumptions
1. Standard git ignore + untracking (`git rm --cached` + `.gitignore`) is preferred over Git LFS because the large binaries are already stored in and served from Cloudflare R2 bucket `chess-studio-engine`.
2. History rewrite (`git filter-repo`) is deferred as per issue specification ("Optional, after team agreement: purge them from history with git filter-repo; History rewrite invalidates open branches and clones; coordinate before doing step 5").
3. `scripts/vinext-deploy.mjs` should remain the entry point for `deploy:vinext` to preserve npm script contract and allow adding pre-deploy warnings if large binaries are present locally.
4. Lite engine (`stockfish-lite.wasm` 1.6MB and `stockfish.wasm` 1.8MB) remains in `public/engine/` since it is well within Workers asset size limits and serves as the default engine build.

## Open Questions
1. None blocking execution. History purge schedule will be coordinated separately with the team.
