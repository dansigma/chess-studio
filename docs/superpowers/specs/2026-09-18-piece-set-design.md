# Piece sets (Lichess CDN)

Date: 2026-09-18  
Status: approved (approach B — CDN)

## Goal

Enable View → Piece Set. Classic stays the current react-chessboard SVGs (offline). Other sets load open Lichess piece SVGs from jsDelivr. Do not copy ChessMonitor artwork or set names.

## In scope

- View submenu, same pattern as Board Theme
- Board panel and Setup Board (including the piece palette)
- Persist in `studio-clone-settings` and existing `user_settings.piece_theme`
- Per-piece fallback to Classic if an image fails

## Out of scope

- Color Scheme, Move Notation, Game Preview Mode
- Bundling SVGs in the repo
- ChessMonitor piece names (Chessnut, RhosGFX, …)

## Sets

Classic (local). CDN folders from `lila/public/piece`: Cburnett, Merida, Alpha, California, Cardinal, Companion, Fantasy, Spatial, Staunty, Letter, Shapes.

URL: `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/{folder}/{wK|…|bP}.svg`

## Constraints

- English UI copy
- No ChessMonitor assets
- No git commit unless asked
