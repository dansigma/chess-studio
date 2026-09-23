# Move notation

Date: 2026-09-18  
Status: approved (display mapper; Portuguese included)

## Goal

View → Move Notation localizes SAN on screen. The tree and exported PGN stay English. Portuguese is a first-class option (R D T B C).

## In scope

- Styles: English, Unicode, German, Spanish, Portuguese, Russian
- Surfaces: Notation panel, engine PV, Ultra Database / player explorer move lists
- Unicode figurines use the side that played the move
- Persist in `studio-clone-settings` only

## Out of scope

- Rewriting PGN
- Color Scheme, Game Preview Mode
- New Supabase column

## Mapping

English piece letters KQRBN. Portuguese: R D T B C. German: K D T L S. Spanish: R D T A C. Russian: Кр Ф Л С К. Castling and `--` unchanged. Promotion `=Q` follows the same map.
