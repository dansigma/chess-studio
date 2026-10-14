# Studio clone

Chess analysis GUI inspired by ChessMonitor Studio: board, Stockfish, notation tree, and opening explorer. It does not use ChessMonitor branding, assets, or their private Ultra Database.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Guest mode works without Supabase: play moves, run the engine, import/export PGN, and browse a built-in master sample book.

## Explorer

Ultra Database maps to the Lichess Masters explorer; Online Database maps to the Lichess online explorer. Those APIs currently return 401 without a token.

- Without `LICHESS_TOKEN`, the app uses a small built-in master sample book so the Ultra Database / Ultra Games tabs still work.
- To use live Lichess stats, create a personal token at [lichess.org/account/oauth/token](https://lichess.org/account/oauth/token) (no scopes required) and add `LICHESS_TOKEN=...` to `.env.local`.

## Supabase (accounts + saved boards)

1. Create a project and run `supabase/migrations/20260317120000_init_studio.sql` in the SQL editor.
2. Under Authentication -> Providers -> Email in the Supabase Dashboard, make sure **Confirm email** is enabled so unconfirmed signups cannot claim allowlisted admin addresses.
3. Copy `.env.example` to `.env.local` and fill in the URL and anon key.
4. Restart `npm run dev`.

Saved boards, settings, and explorer cache then persist. Opening-database tables (`games`, `game_positions`, `position_stats`) are created empty for a later ingest phase.

## Stockfish Engine

The application supports two engine builds:

- **Stockfish 19 lite (Default)**: Bundled in `public/engine/` (`stockfish-lite.wasm` ~1.6 MB and `stockfish.wasm` ~1.8 MB). Used by default for local development and standard analysis.
- **Stockfish 19 full**: Uses the full NNUE evaluation network (~95 MB WASM: `stockfish-19-single.wasm` and `full/stockfish-19.wasm`). Because Cloudflare Workers assets are capped at 25 MiB per file, the full WASM binaries are not committed to git and are served dynamically in production from Cloudflare R2 (`chess-studio-engine` bucket) via `app/engine/[...path]/route.ts`.

### Local Development with Full Engine (Optional)

Local development and tests work out-of-the-box with the bundled lite engine. If you need to test the full 95 MB engine offline in local dev:

1. Download the WASM binaries from the R2 bucket into `public/engine/`:
   ```bash
   npx wrangler r2 object get chess-studio-engine/engine/stockfish-19-single.wasm --file public/engine/stockfish-19-single.wasm
   npx wrangler r2 object get chess-studio-engine/engine/full/stockfish-19.wasm --file public/engine/full/stockfish-19.wasm
   ```
2. Both files are listed in `.gitignore` and will remain untracked.

### Uploading Engine Builds to Cloudflare R2

To upload or update the full WASM binaries in the `chess-studio-engine` R2 bucket:

```bash
npx wrangler r2 object put chess-studio-engine/engine/stockfish-19-single.wasm --file <path-to-wasm> --content-type application/wasm
npx wrangler r2 object put chess-studio-engine/engine/full/stockfish-19.wasm --file <path-to-wasm> --content-type application/wasm
```

## Stack

- Next.js + Tailwind
- `react-chessboard` + `chess.js`
- Stockfish 19 lite (WASM worker in `public/engine`, GPL)
- `dockview-react` layout
- Lichess opening explorer (`/masters` and `/lichess`) with a local sample-book fallback
- Optional Supabase Auth + Postgres
