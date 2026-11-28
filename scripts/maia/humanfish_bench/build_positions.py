#!/usr/bin/env python3
"""Build HumanFish Nov 2026 replication positions.jsonl from downloaded broadcast PGNs."""

from __future__ import annotations

import argparse
import json
import random
import re
from collections import Counter
from pathlib import Path

import chess
import chess.pgn

DEFAULT_RAW_DIR = Path("/home/danilo/data/maia/humanfish-nov2026/raw")
DEFAULT_OUT = Path("/home/danilo/data/maia/humanfish-nov2026/positions.jsonl")
DEFAULT_SUMMARY = Path("/home/danilo/data/maia/humanfish-nov2026/positions_summary.json")

ENGINE_OR_VARIANT_KEYWORDS = (
    "stockfish",
    "leela",
    "lc0",
    "komodo",
    "tcec",
    "cccc",
    "chess960",
    "fischer random",
    "fischerrandom",
    "freestyle",
)


def parse_elo(val: str | None) -> int | None:
    if not val:
        return None
    m = re.match(r"^\d+$", val.strip())
    return int(val.strip()) if m else None


def parse_date(headers: chess.pgn.Headers) -> str | None:
    for key in ("Date", "UTCDate"):
        raw = headers.get(key, "").strip()
        if re.match(r"^\d{4}\.\d{2}\.\d{2}$", raw):
            return raw
    return None


def infer_time_control_class(
    fide_tc: str | None,
    tc_str: str | None,
    pgn_tc: str | None,
    tour_name: str,
    first_clk: float | None = None,
) -> str:
    """Infer 'classical' | 'rapid' | 'blitz' from PGN TimeControl, initial clock, or broadcast metadata."""
    # 1. Parse explicit PGN TimeControl tag when present and meaningful
    if pgn_tc and pgn_tc not in ("?", "-", ""):
        t = pgn_tc.strip().lower()
        if "40/7200" in t or "90 minutes" in t or "120'" in t:
            return "classical"
        m = re.match(r"^(\d+)(?:\+(\d+))?$", t)
        if m:
            base = int(m.group(1))
            inc = int(m.group(2) or 0)
            # Lichess/PGN sometimes writes minutes (e.g. "3+2", "15+10") when base <= 60
            base_s = base * 60 if base <= 60 else base
            est = base_s + 40 * inc
            if est >= 3600:
                return "classical"
            if est >= 600:
                return "rapid"
            return "blitz"

    # 2. Infer from initial clock when TimeControl is "?"
    if first_clk is not None:
        if first_clk < 420:
            return "blitz"
        if first_clk < 2400:
            return "rapid"
        return "classical"

    # 3. Tournament name / broadcast metadata fallback
    name_lower = tour_name.lower()
    if "blitz" in name_lower:
        return "blitz"
    if "rapid" in name_lower:
        return "rapid"
    if fide_tc:
        ftc = fide_tc.strip().lower()
        if ftc in ("standard", "classical"):
            return "classical"
        if ftc in ("rapid", "blitz"):
            return ftc

    return "classical"


def sample_plies(total_plies: int, rng: random.Random, start_ply: int = 12, n_buckets: int = 6) -> list[int]:
    """Divide [start_ply, total_plies - 1] into n_buckets equal buckets and pick 1 ply uniformly per bucket."""
    if total_plies <= start_ply:
        return []
    span = total_plies - start_ply
    sampled: list[int] = []
    for i in range(n_buckets):
        b_start = start_ply + (i * span) // n_buckets
        b_end = start_ply + ((i + 1) * span) // n_buckets
        if b_start < b_end:
            sampled.append(rng.randrange(b_start, b_end))
    return sampled


def is_engine_or_variant(headers: chess.pgn.Headers) -> bool:
    variant = headers.get("Variant", "").strip().lower()
    if variant and variant != "standard":
        return True
    setup = headers.get("SetUp", "").strip()
    fen = headers.get("FEN", "").strip()
    if setup == "1" and fen and fen != chess.STARTING_FEN:
        return True
    blob = " ".join(
        headers.get(k, "") for k in ("Event", "Site", "White", "Black")
    ).lower()
    return any(kw in blob for kw in ENGINE_OR_VARIANT_KEYWORDS)


def extract_game_record(game: chess.pgn.Game) -> tuple[list[chess.Move], list[float | None], int]:
    """Extract mainline moves, per-ply clocks (after each ply), and count of valid clocks."""
    moves: list[chess.Move] = []
    clocks: list[float | None] = []
    valid_clocks = 0
    node: chess.pgn.GameNode = game
    while node.variations:
        next_node = node.variation(0)
        moves.append(next_node.move)
        clk = next_node.clock()
        clocks.append(clk)
        if clk is not None:
            valid_clocks += 1
        node = next_node
    return moves, clocks, valid_clocks


def build_positions(
    raw_dir: Path,
    out_path: Path,
    summary_path: Path | None = None,
    seed: int = 1503,
    min_date: str = "2026.11.01",
    max_date: str = "2026.11.26",
    min_elo: int = 2400,
    max_elo: int = 2900,
    min_plies: int = 16,
    min_clock_frac: float = 0.60,
) -> dict:
    manifest = json.loads((raw_dir / "manifest.json").read_text(encoding="utf-8"))
    rng = random.Random(seed)

    drops = Counter()
    games_per_tournament = Counter()
    positions_per_tc = Counter()
    positions_per_tournament = Counter()
    seen_games: set[tuple[str, str, str, tuple[str, ...]]] = set()
    total_raw_games = 0
    kept_games = 0
    total_positions = 0
    games_without_any_clocks = 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as out_f:
        for entry in manifest["tournaments"]:
            if entry.get("status") != "downloaded" or not entry.get("pgn_file"):
                continue
            tour_id = entry["id"]
            tour_name = entry["name"]
            pgn_path = raw_dir / entry["pgn_file"]
            fide_tc = entry.get("fide_tc")
            manifest_tc = entry.get("tc")

            with pgn_path.open("r", encoding="utf-8", errors="replace") as pgn_f:
                game_idx = 0
                while True:
                    game = chess.pgn.read_game(pgn_f)
                    if game is None:
                        break
                    game_idx += 1
                    total_raw_games += 1
                    headers = game.headers

                    if is_engine_or_variant(headers):
                        drops["variant_or_engine"] += 1
                        continue

                    date_str = parse_date(headers)
                    if date_str is None or date_str < min_date or date_str > max_date:
                        drops["date_out_of_range"] += 1
                        continue

                    w_elo = parse_elo(headers.get("WhiteElo"))
                    b_elo = parse_elo(headers.get("BlackElo"))
                    if (
                        w_elo is None
                        or b_elo is None
                        or not (min_elo <= w_elo <= max_elo)
                        or not (min_elo <= b_elo <= max_elo)
                    ):
                        drops["elo_out_of_range"] += 1
                        continue

                    moves, clocks, valid_clocks = extract_game_record(game)
                    total_plies = len(moves)
                    if total_plies < min_plies:
                        drops["too_short_lt_16_plies"] += 1
                        continue

                    if valid_clocks == 0:
                        games_without_any_clocks += 1
                        drops["no_clocks"] += 1
                        continue
                    if valid_clocks / total_plies < min_clock_frac:
                        drops["clocks_lt_60pct"] += 1
                        continue

                    white_name = headers.get("White", "").strip()
                    black_name = headers.get("Black", "").strip()
                    moves_uci_all = [m.uci() for m in moves]
                    dedup_key = (
                        date_str,
                        re.sub(r"\s+", " ", white_name.lower()),
                        re.sub(r"\s+", " ", black_name.lower()),
                        tuple(moves_uci_all),
                    )
                    if dedup_key in seen_games:
                        drops["duplicate"] += 1
                        continue
                    seen_games.add(dedup_key)

                    kept_games += 1
                    games_per_tournament[tour_name] += 1

                    pgn_tc = headers.get("TimeControl", "").strip()
                    first_clk = next((c for c in clocks if c is not None), None)
                    tc_class = infer_time_control_class(
                        fide_tc, manifest_tc, pgn_tc, tour_name, first_clk=first_clk
                    )
                    tc_value = pgn_tc if pgn_tc and pgn_tc != "?" else (manifest_tc or "?")
                    round_str = headers.get("Round", "").strip()
                    game_id = f"{tour_id}_{game_idx}"

                    sampled = set(sample_plies(total_plies, rng))
                    board = game.board()
                    last_white_clk: float | None = None
                    last_black_clk: float | None = None

                    for ply in range(total_plies):
                        if ply in sampled:
                            side = "white" if board.turn == chess.WHITE else "black"
                            pos_record = {
                                "id": f"{game_id}:{ply}",
                                "game_id": game_id,
                                "tournament": tour_name,
                                "round": round_str,
                                "white": white_name,
                                "black": black_name,
                                "white_elo": w_elo,
                                "black_elo": b_elo,
                                "time_control_class": tc_class,
                                "time_control": tc_value,
                                "ply": ply,
                                "moves_uci": moves_uci_all[:ply],
                                "fen": board.fen(),
                                "played_uci": moves_uci_all[ply],
                                "clock_white_s": last_white_clk,
                                "clock_black_s": last_black_clk,
                                "side_to_move": side,
                            }
                            out_f.write(json.dumps(pos_record, ensure_ascii=False) + "\n")
                            total_positions += 1
                            positions_per_tc[tc_class] += 1
                            positions_per_tournament[tour_name] += 1

                        # Advance board and update pre-move clock for next ply
                        if board.turn == chess.WHITE:
                            if clocks[ply] is not None:
                                last_white_clk = clocks[ply]
                        else:
                            if clocks[ply] is not None:
                                last_black_clk = clocks[ply]
                        board.push(moves[ply])

    summary = {
        "seed": seed,
        "total_raw_games": total_raw_games,
        "kept_games": kept_games,
        "total_positions": total_positions,
        "games_without_any_clocks": games_without_any_clocks,
        "filter_drops": dict(drops),
        "games_per_tournament": dict(games_per_tournament),
        "positions_per_tournament": dict(positions_per_tournament),
        "positions_per_time_control_class": dict(positions_per_tc),
        "published_reference": {
            "humanfish_games": 450,
            "humanfish_positions": 2698,
            "toby2_games": 523,
            "toby2_positions": 3136,
        },
    }
    if summary_path is not None:
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build HumanFish Nov 2026 positions.jsonl")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--seed", type=int, default=1503)
    args = parser.parse_args()

    summary = build_positions(args.raw_dir, args.out, args.summary, seed=args.seed)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
