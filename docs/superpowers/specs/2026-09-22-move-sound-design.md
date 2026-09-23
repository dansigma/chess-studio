# Move sound

Date: 2026-09-22  
Status: approved

## Goal

A short move sound plays when the position advances. View → Move Sound turns it off and on. The choice is stored in this browser with the other studio settings.

## In scope

- One original tone generated in the browser (no borrowed audio file)
- Sound on a played move, a null move, forward, skip, end, a later ply, or another variation
- One sound for an engine line, not one per ply
- Default on
- Local settings only (`studio-clone-settings`). No new database column

## Out of scope

- Sound while stepping backward or returning to the start
- Capture, check, or game-end sounds
- Print, share, repertoire, and training
