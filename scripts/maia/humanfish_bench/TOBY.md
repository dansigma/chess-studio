# Toby 2 Benchmark Runner

Internal move-prediction benchmark runner for **Toby 2** on the RTX 3090 desktop (`Danilo@desktop`, WSL Ubuntu 24.04).

**Attribution:** Toby © Yosha Iglesias, [toby.tribychess.org](https://toby.tribychess.org) (source: [Yosha87/Toby](https://github.com/Yosha87/Toby)).

## Licence & Isolation

- Toby 2 is licensed under **AGPL v3** with **Section 7 additional terms** (`NOTICE.md`).
- Stockfish 19 (GPL v3), Leela Chess Zero `lc0` v0.32.1 (GPL v3 + NVIDIA CUDA permission), Toby 2's modified BT4 network `toby2_b.pt` (~371 MB, GPL-3.0-or-later), and `BT3-768x15x24h-swa-2790000.pb.gz` are shipped in the official `Toby-linux-full` release package.
- `run_toby.py` runs the official `toby` binary **unmodified** as a separate UCI process over stdin/stdout without patching any upstream code.

## Variants

The `Toby-linux-full` package provides two `Toby 2 Product` modes:

| Variant | Network Device | Search / Correction | Matches HumanFish "Toby 2 Accurate" |
|---|---|---|---|
| **Accurate** (default) | CUDA (`fp32`, `toby2_b.pt`) | Stockfish 19 (150k + 250k nodes) + `lc0` v0.32.1 (`BT3`, `cuda-fp16`, 1024 nodes) + `toby2_lhead.pt` (on in Classical; off by default in Rapid/Blitz) | **Yes** |
| **Standard** | CPU (`fp32`, `toby2_b.pt`) | Stockfish 19 (150k + 250k nodes), no `lc0` | No |

## Desktop Setup (`~/toby/`)

Installed in WSL Ubuntu 24.04 under `~/toby/` (separate from `~/maia-ft/.venv` and `~/maia-ft/runs/`):

- Source repo: `~/toby` (`https://github.com/Yosha87/Toby`)
- Release package: `~/toby/dist/Toby-linux-full-2.0-2026-11-22.zip` (sha256 `a01b3b7a08d8bac3395d421cc4b62315af653818a2b74f0a718670db7fb5f2d8`), unpacked to `~/toby/release/Toby/`
  - Contains `toby` (frozen UCI binary), `nets/toby2_b.pt` (~371 MB), `nets/toby2_lhead.pt`, `nets/toby2_level.pt`, `nets/BT3-768x15x24h-swa-2790000.pb.gz`, `stockfish/`, `lc0/`, and CUDA 12.4 libraries.
- Runner venv: `~/toby/.venv` (Python 3.13 via `uv`, with `chess==1.11.2` and `numpy`)
- Runner scripts synced to `~/toby/bench/`: `run_toby.py` and `run_toby_systemd.sh`

## Commands

Direct run (resumable; skips `id`s already present in `--output`):

```bash
~/toby/.venv/bin/python ~/toby/bench/run_toby.py \
  --input /path/to/positions.jsonl \
  --output /path/to/toby_predictions.jsonl
```

Background run via `systemd-run --user` (recommended for full 3,000-position runs):

```bash
~/toby/bench/run_toby_systemd.sh \
  /path/to/positions.jsonl \
  /path/to/toby_predictions.jsonl
```

Useful options:
- `--product Accurate|Standard` (default: `Accurate`)
- `--rating-source "FIDE"|"Lichess Classical"|"Lichess Rapid"|"Lichess Blitz"|"Chess.com Rapid"|"Chess.com Blitz"` (default: `FIDE`)
- `--leela-head Product|On|Off` (default: `Product`)
- `--device Auto|CPU|GPU` (default: `Auto`)
- `--movetime-ms 30000` (default: `30000`)

## Input Mapping

Each JSONL line is mapped to Toby's UCI interface as follows:

| Input JSONL Field | Toby UCI Mapping | Notes |
|---|---|---|
| `moves_uci` | `position startpos moves ...` | Preferred over `fen` so Toby gets full 8-ply history for Leela's 112-plane encoder; falls back to `position fen <fen>` if `moves_uci` is absent. |
| `white_elo`, `black_elo` | `setoption name White Rating value ...`, `Black Rating` | Uses `0` if null. |
| `time_control_class` | `setoption name Time Control value Classical\|Rapid\|Blitz` | Case-insensitive mapping. |
| `time_control` | `setoption name Base Time value ...`, `Increment` | Parses first stage (e.g. `40/5400+30:1800+30` -> `5400`, `30`); unknown/`-` maps to `0` / `-1`. |
| `clock_white_s`, `clock_black_s` | `go movetime 30000 wtime <ms> btime <ms> [winc <ms> binc <ms>]` | Included when both clocks are non-null; otherwise `go movetime 30000` (Toby's masked-clock path). |
| `id`, `played_uci` | Output `id`, `p_played` lookup | `played_uci` is never sent to Toby. |
| `game_id`, `tournament`, `round`, `white`, `black`, `ply`, `side_to_move`, `fen` | Not sent to Toby | `side_to_move` is implied by `moves_uci`; `game_id`/`tournament`/`round`/names/ply are metadata only. |

## Caveats

- **Probability cutoff (`p >= 0.001`):** Toby's `Display = Full` UCI output emits `info string toby move <uci> ... prob <p>` only for moves with `p >= 0.001` (summing remaining legal moves into `info string toby others <sum> <count>`). Therefore, in forced positions, `top` may contain fewer than 5 moves, and `p_played` is `null` if the played move had probability `< 0.001`.
- **Clock + `movetime`:** Passing `movetime 30000` alongside `wtime`/`btime` ensures Toby's `time_budget` stays above its `0.6s` threshold (`TOBY2_VALUES_BELOW`) so Stockfish 19 and `lc0` always run even in time-trouble positions, while Toby still returns `bestmove` immediately upon completion (~0.45 s/pos).
- **Startup cost:** First `isready` takes ~10–11 s to load `toby2_b.pt` on CUDA and run `lc0`'s 3-position self-check.

## Sanity Test (2026-11-28)

Evaluated 60 classical positions (10 games × 6 plies, plies 16/22/28/34/40/46, with FIDE Elos and clocks) from Lichess broadcast `London Chess Classic 2026: Swiss` Round 1 (`oDhMWn1x`) using `Toby 2 Accurate`:

- **Top-1 accuracy:** 35/60 (**58.3%**)
- **Top-3 accuracy:** 54/60 (**90.0%**)
- **`p_played` coverage:** 60/60 (**100.0%**)
- **Per-position latency:** mean **0.453 s**, median **0.459 s** (range 0.368–0.519 s)
- **Throughput:** **2.21 positions/s** (27.18 s for 60 positions)
- **GPU memory (RTX 3090):** **3,839–3,861 MiB / 24,576 MiB** total (~2.28 GiB above 1,580 MiB idle baseline), 72–84% GPU utilization
- **ETA for 3,000 positions:** **~22.7 minutes** (~1,359 s + ~10 s startup)
