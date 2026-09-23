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
2. Copy `.env.example` to `.env.local` and fill in the URL and anon key.
3. Restart `npm run dev`.

Saved boards, settings, and explorer cache then persist. Opening-database tables (`games`, `game_positions`, `position_stats`) are created empty for a later ingest phase.

## Stack

- Next.js + Tailwind
- `react-chessboard` + `chess.js`
- Stockfish 19 lite (WASM worker in `public/engine`, GPL)
- `dockview-react` layout
- Lichess opening explorer (`/masters` and `/lichess`) with a local sample-book fallback
- Optional Supabase Auth + Postgres
