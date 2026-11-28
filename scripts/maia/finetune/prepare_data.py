"""Prepare sharded .npy memmaps from Lumbra's OTB PGN for Maia-3 fine-tuning."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
import json
import os
from pathlib import Path
import random
import sys
from time import monotonic

import chess
import chess.pgn
import numpy as np

THIS_DIR = Path(__file__).resolve().parent
MAIA_DIR = THIS_DIR.parent
sys.path.insert(0, str(MAIA_DIR))
sys.path.insert(0, str(THIS_DIR))

import calibrate  # noqa: E402
import calibrate_combined  # noqa: E402
from encoding import board_to_uint8  # noqa: E402

ELO_MIN = 1600
ELO_MAX = 2900
SHARD_FORMAT_VERSION = 2
DEFAULT_TEST_SEED = 1503
DEFAULT_TEST_PER_BAND = 20000
DEFAULT_VAL_FRACTION = 0.02
DEFAULT_VAL_SEED = 1523
DEFAULT_SHARD_SIZE = 2_000_000
DEFAULT_CHUNK_GAMES = 2000


def parse_eligible_game(tags: dict[bytes, bytes]) -> tuple[int, int, str] | None:
    """Return (white_elo, black_elo, status) if classical >=2010 with gap <=150, else None.

    status is 'ok' when both ratings are in [1600, 2900], or 'out_of_range' otherwise.
    """
    if tags.get(b"Result") not in calibrate.RESULTS:
        return None
    if calibrate.FAST_EVENT.search(tags.get(b"Event", b"")):
        return None
    if tags.get(b"TimeControl", b"").strip().lower() in (b"rapid", b"blitz"):
        return None
    year = tags.get(b"Date", b"").split(b".", 1)[0]
    white_raw, black_raw = tags.get(b"WhiteElo", b""), tags.get(b"BlackElo", b"")
    if not (len(year) == 4 and year.isdigit() and white_raw.isdigit() and black_raw.isdigit()):
        return None
    white, black = int(white_raw), int(black_raw)
    if int(year) < 2010 or abs(white - black) > 150:
        return None
    if not (ELO_MIN <= white <= ELO_MAX and ELO_MIN <= black <= ELO_MAX):
        return white, black, "out_of_range"
    return white, black, "ok"


def elo_band_label(white: int, black: int) -> str:
    mean = (white + black) // 2
    if mean < 1800:
        return "1600-1799"
    if mean < 2000:
        return "1800-1999"
    if mean < 2200:
        return "2000-2199"
    if mean < 2400:
        return "2200-2399"
    if mean < 2600:
        return "2400-2599"
    return "2600-2900"


def scan_headers(
    pgn_path: Path,
    test_per_band: int,
    test_seed: int,
) -> tuple[
    list[tuple[int, int, int, str]],
    Counter,
    dict[int, list[tuple[int, str]]],
    Counter,
]:
    """Single-pass header scan collecting eligible games and SIG-1518 test reservoir."""
    rng = random.Random(test_seed)
    test_eligible = Counter()
    test_sampled: dict[int, list[tuple[int, str]]] = {band: [] for band in calibrate.BANDS}
    eligible_games: list[tuple[int, int, int, str]] = []
    stats = Counter()

    for offset, tags in calibrate.headers(pgn_path):
        stats["total_games"] += 1
        parsed = parse_eligible_game(tags)
        if parsed is None:
            continue
        white, black, status = parsed
        if status == "out_of_range":
            stats["outside_1600_2900"] += 1
            continue

        ek = calibrate_combined.event_key_from_tags(tags)
        eligible_games.append((offset, white, black, ek))
        stats["eligible_in_range"] += 1

        band = calibrate.rating_band(tags)
        if band is not None:
            test_eligible[band] += 1
            item = (offset, ek)
            reservoir = test_sampled[band]
            if len(reservoir) < test_per_band:
                reservoir.append(item)
            else:
                idx = rng.randrange(test_eligible[band])
                if idx < test_per_band:
                    reservoir[idx] = item

    return eligible_games, test_eligible, test_sampled, stats


def compute_sig1518_test_events(
    pgn_path: Path,
    test_sampled: dict[int, list[tuple[int, str]]],
    test_seed: int,
) -> tuple[set[str], dict[int, dict[str, int]]]:
    """Reproduce the exact SIG-1518 held-out event set (seed 1503, 20k/band)."""
    rng = random.Random(test_seed)
    held_events: set[str] = set()
    band_info: dict[int, dict[str, int]] = {}

    with pgn_path.open(encoding="utf-8-sig", errors="replace") as stream:
        for band in calibrate.BANDS:
            items = test_sampled[band]
            distinct_events = {ek for _, ek in items}
            if len(distinct_events) < 2:
                band_info[band] = {
                    "sampled_games": len(items),
                    "distinct_events": len(distinct_events),
                    "held_games": 0,
                    "held_events": 0,
                }
                continue
            fit_items, held_items, n_fit_ev, n_held_ev = calibrate_combined.split_by_event(
                items, rng
            )
            # Advance rng identically to calibrate_combined.py / move_match.py. Those scripts
            # abort on a ValueError here, so let it propagate rather than drift the rng.
            calibrate_combined.parse_combined_samples(stream, fit_items, rng)
            calibrate_combined.parse_combined_samples(stream, held_items, rng)
            for _, ek in held_items:
                held_events.add(ek)
            band_info[band] = {
                "sampled_games": len(items),
                "fit_events": n_fit_ev,
                "held_events": n_held_ev,
                "held_games": len(held_items),
            }
    return held_events, band_info


def split_train_val_events(
    games: list[tuple[int, int, int, str]],
    test_events: set[str],
    val_fraction: float,
    val_seed: int,
) -> tuple[
    list[tuple[int, int, int, str]],
    list[tuple[int, int, int, str]],
    int,
    set[str],
    set[str],
]:
    """Exclude test_events and split remaining events into train and val (~val_fraction)."""
    by_event: dict[str, list[tuple[int, int, int, str]]] = defaultdict(list)
    test_excluded_games = 0
    for game in games:
        ek = game[3]
        if ek in test_events:
            test_excluded_games += 1
        else:
            by_event[ek].append(game)

    event_keys = sorted(by_event.keys())
    if len(event_keys) < 2:
        raise ValueError(f"Need at least 2 non-test events for train/val split, got {len(event_keys)}")

    rng = random.Random(val_seed)
    rng.shuffle(event_keys)

    remaining_total = sum(len(by_event[ek]) for ek in event_keys)
    target_val = max(1, round(val_fraction * remaining_total))

    val_events: set[str] = set()
    train_events: set[str] = set()
    val_games: list[tuple[int, int, int, str]] = []
    train_games: list[tuple[int, int, int, str]] = []

    for i, ek in enumerate(event_keys):
        group = by_event[ek]
        remaining_ev = len(event_keys) - i - 1
        if len(val_games) < target_val and (len(train_games) > 0 or remaining_ev > 0):
            val_events.add(ek)
            val_games.extend(group)
        else:
            train_events.add(ek)
            train_games.extend(group)

    # Sort by PGN byte offset for sequential disk reads in workers.
    train_games.sort(key=lambda g: g[0])
    val_games.sort(key=lambda g: g[0])
    return train_games, val_games, test_excluded_games, train_events, val_events


def _process_chunk(
    task: tuple[str, list[tuple[int, int, int, int]]],
) -> dict:
    """Worker: parse a chunk of (offset, white_elo, black_elo, game_id) into compact arrays."""
    pgn_str, items = task
    boards_list: list[np.ndarray] = []
    stm_list: list[int] = []
    move_list: list[int] = []
    result_list: list[int] = []
    self_elo_list: list[int] = []
    oppo_elo_list: list[int] = []
    game_id_list: list[int] = []
    ply_list: list[int] = []
    legal_idx_list: list[int] = []
    legal_lens_list: list[int] = []
    band_pos_counts = Counter()
    band_game_counts = Counter()
    skipped = 0

    with open(pgn_str, encoding="utf-8-sig", errors="replace") as stream:
        for offset, white_elo, black_elo, game_id in items:
            stream.seek(offset)
            game = chess.pgn.read_game(stream, Visitor=calibrate.MainlineBuilder)
            if game is None or game.errors:
                skipped += 1
                continue
            board = game.board()
            outcome = calibrate.RESULTS.get(game.headers.get("Result", "").encode())
            if outcome is None or board.uci_variant != "chess" or board.chess960:
                skipped += 1
                continue
            moves = list(game.mainline_moves())
            if not moves or any(not m for m in moves):
                skipped += 1
                continue

            # outcome in calibrate.RESULTS: 0 = 1-0 (White win), 1 = draw, 2 = 0-1 (Black win).
            # Value logit order: 0 = loss, 1 = draw, 2 = win for side to move.
            white_result = 2 if outcome == 0 else (1 if outcome == 1 else 0)
            black_result = 2 - white_result

            g_boards: list[np.ndarray] = []
            g_stm: list[int] = []
            g_move: list[int] = []
            g_res: list[int] = []
            g_self: list[int] = []
            g_oppo: list[int] = []
            g_ply: list[int] = []
            g_legal_idx: list[int] = []
            g_legal_lens: list[int] = []
            valid = True

            for ply, move in enumerate(moves):
                if not board.is_legal(move):
                    valid = False
                    break
                turn = board.turn
                legal = [calibrate.move_index(m, turn) for m in board.legal_moves]
                if not legal:
                    valid = False
                    break
                g_boards.append(board_to_uint8(board))
                g_stm.append(0 if turn == chess.WHITE else 1)
                g_move.append(calibrate.move_index(move, turn))
                g_legal_idx.extend(legal)
                g_legal_lens.append(len(legal))
                if turn == chess.WHITE:
                    g_res.append(white_result)
                    g_self.append(white_elo)
                    g_oppo.append(black_elo)
                else:
                    g_res.append(black_result)
                    g_self.append(black_elo)
                    g_oppo.append(white_elo)
                g_ply.append(ply)
                board.push(move)

            if not valid or not g_boards:
                skipped += 1
                continue

            n_pos = len(g_boards)
            band_lbl = elo_band_label(white_elo, black_elo)
            band_game_counts[band_lbl] += 1
            band_pos_counts[band_lbl] += n_pos

            boards_list.extend(g_boards)
            stm_list.extend(g_stm)
            move_list.extend(g_move)
            result_list.extend(g_res)
            self_elo_list.extend(g_self)
            oppo_elo_list.extend(g_oppo)
            game_id_list.extend([game_id] * n_pos)
            ply_list.extend(g_ply)
            legal_idx_list.extend(g_legal_idx)
            legal_lens_list.extend(g_legal_lens)

    if not boards_list:
        return {
            "n": 0,
            "skipped": skipped,
            "band_games": dict(band_game_counts),
            "band_pos": dict(band_pos_counts),
        }

    return {
        "n": len(boards_list),
        "skipped": skipped,
        "band_games": dict(band_game_counts),
        "band_pos": dict(band_pos_counts),
        "boards": np.stack(boards_list, axis=0).astype(np.uint8),
        "stm": np.asarray(stm_list, dtype=np.uint8),
        "move_idx": np.asarray(move_list, dtype=np.uint16),
        "result": np.asarray(result_list, dtype=np.uint8),
        "self_elo": np.asarray(self_elo_list, dtype=np.uint16),
        "oppo_elo": np.asarray(oppo_elo_list, dtype=np.uint16),
        "game_id": np.asarray(game_id_list, dtype=np.uint32),
        "ply": np.asarray(ply_list, dtype=np.uint16),
        "legal_idx": np.asarray(legal_idx_list, dtype=np.uint16),
        "legal_lens": np.asarray(legal_lens_list, dtype=np.int32),
    }


def _flush_shard(out_dir: Path, shard_idx: int, buf: list[dict]) -> dict:
    shard_dir = out_dir / f"shard_{shard_idx:04d}"
    shard_dir.mkdir(parents=True, exist_ok=True)
    fields = (
        "boards",
        "stm",
        "move_idx",
        "result",
        "self_elo",
        "oppo_elo",
        "game_id",
        "ply",
        "legal_idx",
    )
    n_pos = sum(chunk["n"] for chunk in buf)
    for field in fields:
        arr = np.concatenate([chunk[field] for chunk in buf], axis=0)
        np.save(shard_dir / f"{field}.npy", arr)
    all_lens = np.concatenate([chunk["legal_lens"] for chunk in buf], axis=0)
    legal_offsets = np.empty(n_pos + 1, dtype=np.int64)
    legal_offsets[0] = 0
    np.cumsum(all_lens, dtype=np.int64, out=legal_offsets[1:])
    np.save(shard_dir / "legal_offsets.npy", legal_offsets)
    return {"name": shard_dir.name, "positions": int(n_pos)}


def write_split_shards(
    pgn_path: Path,
    games: list[tuple[int, int, int, str]],
    out_dir: Path,
    shard_size: int,
    chunk_games: int,
    workers: int,
    split_name: str,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    tasks = []
    pgn_str = str(pgn_path)
    for start in range(0, len(games), chunk_games):
        chunk = [
            (offset, white, black, start + i)
            for i, (offset, white, black, _ek) in enumerate(games[start : start + chunk_games])
        ]
        tasks.append((pgn_str, chunk))

    shards_meta: list[dict] = []
    buf: list[dict] = []
    buf_pos = 0
    total_pos = 0
    total_skipped = 0
    band_games = Counter()
    band_pos = Counter()
    t0 = monotonic()

    with ProcessPoolExecutor(max_workers=workers) as pool:
        for idx, res in enumerate(pool.map(_process_chunk, tasks, chunksize=1), 1):
            total_skipped += res["skipped"]
            band_games.update(res["band_games"])
            band_pos.update(res["band_pos"])
            if res["n"] > 0:
                buf.append(res)
                buf_pos += res["n"]
                total_pos += res["n"]
                if buf_pos >= shard_size:
                    shards_meta.append(_flush_shard(out_dir, len(shards_meta), buf))
                    buf.clear()
                    buf_pos = 0
            if idx % 20 == 0 or idx == len(tasks):
                dt = monotonic() - t0
                rate = total_pos / max(dt, 1e-6)
                print(
                    f"[{split_name}] chunk {idx}/{len(tasks)} | "
                    f"{total_pos:,} pos | {rate:,.0f} pos/s",
                    flush=True,
                )

    if buf:
        shards_meta.append(_flush_shard(out_dir, len(shards_meta), buf))
        buf.clear()

    return {
        "games_attempted": len(games),
        "games_usable": int(sum(band_games.values())),
        "games_skipped": int(total_skipped),
        "positions": int(total_pos),
        "band_games": dict(sorted(band_games.items())),
        "band_positions": dict(sorted(band_pos.items())),
        "shards": shards_meta,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgn", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--workers", default=min(24, os.cpu_count() or 8), type=int)
    parser.add_argument("--shard-size", default=DEFAULT_SHARD_SIZE, type=int)
    parser.add_argument("--chunk-games", default=DEFAULT_CHUNK_GAMES, type=int)
    parser.add_argument("--val-fraction", default=DEFAULT_VAL_FRACTION, type=float)
    parser.add_argument("--val-seed", default=DEFAULT_VAL_SEED, type=int)
    parser.add_argument("--test-seed", default=DEFAULT_TEST_SEED, type=int)
    parser.add_argument("--test-per-band", default=DEFAULT_TEST_PER_BAND, type=int)
    args = parser.parse_args()

    t_start = monotonic()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Scanning PGN headers: {args.pgn}", flush=True)
    eligible_games, test_eligible, test_sampled, scan_stats = scan_headers(
        args.pgn, args.test_per_band, args.test_seed
    )
    print(
        f"Scan done in {monotonic() - t_start:.1f}s | "
        f"total={scan_stats['total_games']:,} | "
        f"eligible_in_[1600,2900]={scan_stats['eligible_in_range']:,} | "
        f"outside_[1600,2900]={scan_stats['outside_1600_2900']:,}",
        flush=True,
    )

    test_events, test_band_info = compute_sig1518_test_events(
        args.pgn, test_sampled, args.test_seed
    )
    print(f"SIG-1518 held-out test events: {len(test_events):,}", flush=True)

    train_games, val_games, test_excluded_games, train_events, val_events = split_train_val_events(
        eligible_games, test_events, args.val_fraction, args.val_seed
    )
    print(
        f"Split: train={len(train_games):,} games ({len(train_events):,} events) | "
        f"val={len(val_games):,} games ({len(val_events):,} events) | "
        f"test_excluded={test_excluded_games:,} games",
        flush=True,
    )

    # Save test event reference for zero-leakage verification and evaluation.
    test_ref = {
        "test_seed": args.test_seed,
        "test_per_band": args.test_per_band,
        "test_eligible_by_band": {str(k): v for k, v in sorted(test_eligible.items())},
        "test_band_info": {str(k): v for k, v in sorted(test_band_info.items())},
        "held_events": sorted(test_events),
    }
    (args.out_dir / "test_events.json").write_text(
        json.dumps(test_ref, indent=2), encoding="utf-8"
    )

    train_meta = write_split_shards(
        args.pgn,
        train_games,
        args.out_dir / "train",
        args.shard_size,
        args.chunk_games,
        args.workers,
        "train",
    )
    val_meta = write_split_shards(
        args.pgn,
        val_games,
        args.out_dir / "val",
        args.shard_size,
        args.chunk_games,
        args.workers,
        "val",
    )

    meta = {
        "shard_format_version": SHARD_FORMAT_VERSION,
        "pgn": str(args.pgn),
        "elo_range": [ELO_MIN, ELO_MAX],
        "scan_stats": dict(scan_stats),
        "test_excluded_games": test_excluded_games,
        "test_events_count": len(test_events),
        "train_events_count": len(train_events),
        "val_events_count": len(val_events),
        "train": train_meta,
        "val": val_meta,
        "elapsed_seconds": round(monotonic() - t_start, 2),
    }
    (args.out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Data prep complete in {meta['elapsed_seconds']:.1f}s -> {args.out_dir}", flush=True)


if __name__ == "__main__":
    main()
