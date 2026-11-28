#!/usr/bin/env python3
"""Check contamination of HumanFish Nov 2026 test games in LumbrasGigabase_OTB_Complete.pgn."""

from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import subprocess
from pathlib import Path

import chess.pgn

DEFAULT_POSITIONS = Path("/home/danilo/data/maia/humanfish-nov2026/positions.jsonl")
DEFAULT_PGN = Path("/home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn")
DEFAULT_OUT = Path("/home/danilo/data/maia/humanfish-nov2026/contamination.json")
DATE_TAG_RE = re.compile(r'\[Date "([0-9?]{4}\.[0-9?]{2}\.[0-9?]{2})"\]')

TAG_RE = re.compile(rb'^\[([A-Za-z0-9_]+)\s+"(.*)"\]\s*$')


def may_be_in_test_window(date_str: str) -> bool:
    """True if a PGN date is in 2026-11-01..26 or too partial (`?`) to rule that out."""
    if len(date_str) != 10:
        return True
    for lo, hi, part in ((0, 4, "2026"), (5, 7, "11")):
        field = date_str[lo:hi]
        if "?" not in field and field != part:
            return False
    day = date_str[8:10]
    return "?" in day or "01" <= day <= "26"


def norm_name(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def load_test_games(positions_path: Path) -> dict[str, dict]:
    """Reconstruct unique test games (full moves_uci up to the last sampled ply) from positions.jsonl."""
    games: dict[str, dict] = {}
    with positions_path.open("r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            gid = row["game_id"]
            full_prefix = row["moves_uci"] + [row["played_uci"]]
            existing = games.get(gid)
            if existing is None or len(full_prefix) > len(existing["moves_prefix"]):
                games[gid] = {
                    "game_id": gid,
                    "white": row["white"],
                    "black": row["black"],
                    "white_norm": norm_name(row["white"]),
                    "black_norm": norm_name(row["black"]),
                    "moves_prefix": full_prefix,
                }
    return games


def parse_game_moves_uci(pgn_bytes: bytes) -> list[str]:
    game = chess.pgn.read_game(io.StringIO(pgn_bytes.decode("utf-8", errors="replace")))
    if game is None:
        return []
    return [move.uci() for move in game.mainline_moves()]


def scan_pgn_fast_rg(pgn_path: Path, games: dict[str, dict]) -> dict | None:
    """Use ripgrep to count games, find max 2026+ date, and locate any 2026.11+ games in seconds."""
    rg_bin = shutil.which("rg")
    if rg_bin is None:
        return None

    # 1. Total games
    cnt_res = subprocess.run(
        [rg_bin, "-c", r"^\[Event ", str(pgn_path)],
        capture_output=True,
        text=True,
        check=True,
    )
    total_games = int(cnt_res.stdout.strip() or "0")

    # 2. Max valid YYYY.MM.DD date among 2026+ (fallback to 2020+ if none); unknown years (????) are kept
    #    so a partial date that could fall in the test window forces the full scan
    date_res = subprocess.run(
        [rg_bin, "-N", r'^\[Date "(?:202[6-9?]|20\?\?|\?{4})\.', str(pgn_path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if not date_res.stdout.strip():
        date_res = subprocess.run(
            [rg_bin, "-N", r'^\[Date "(?:202[0-9?]|20\?\?|\?{4})\.', str(pgn_path)],
            capture_output=True,
            text=True,
            check=False,
        )
    max_valid_ymd = ""
    max_date = ""
    nov_lines = 0
    for line in date_res.stdout.splitlines():
        match = DATE_TAG_RE.match(line)
        if match is None:
            continue
        val = match.group(1)
        if val > max_date:
            max_date = val
        if "?" not in val and len(val) == 10 and val[4] == "." and val[7] == ".":
            if val > max_valid_ymd:
                max_valid_ymd = val
            if val >= "2026.11":
                nov_lines += 1
        elif may_be_in_test_window(val):
            nov_lines += 1  # partial date: only the full scan can rule it out

    if nov_lines == 0:
        return {
            "pgn_path": str(pgn_path),
            "scan_method": "ripgrep",
            "total_games_scanned": total_games,
            "max_valid_ymd": max_valid_ymd,
            "max_date_tag": max_date,
            "games_date_ge_2026_11": 0,
            "test_games_checked": len(games),
            "games_partial_date_maybe_in_window": 0,
            "player_pair_date_matches": 0,
            "contaminated_games_count": 0,
            "contaminated_games": [],
        }
    return None  # Fall back to full Python scan if any 2026.11+ games exist


def scan_pgn_python(pgn_path: Path, games: dict[str, dict]) -> dict:
    by_players: dict[tuple[str, str], list[dict]] = {}
    for g in games.values():
        by_players.setdefault((g["white_norm"], g["black_norm"]), []).append(g)

    total_games = 0
    max_date = ""
    max_valid_ymd = ""
    date_ge_2026_11 = 0
    partial_dates_in_window = 0
    player_pair_matches = 0
    matched_game_ids: set[str] = set()
    matched_details: list[dict] = []

    current_headers: dict[str, str] = {}
    current_lines: list[bytes] = []
    in_headers = False
    is_candidate = False

    def process_record() -> None:
        nonlocal total_games, max_date, max_valid_ymd, date_ge_2026_11, partial_dates_in_window, player_pair_matches
        if not current_headers:
            return
        total_games += 1
        date_str = current_headers.get("Date", "")
        if date_str and "?" not in date_str and len(date_str) == 10 and date_str[4] == "." and date_str[7] == ".":
            if date_str > max_valid_ymd:
                max_valid_ymd = date_str
            if date_str >= "2026.11":
                date_ge_2026_11 += 1
        elif may_be_in_test_window(date_str):
            partial_dates_in_window += 1
        if date_str > max_date and len(date_str) >= 4 and date_str[:4].isdigit():
            max_date = date_str

        if is_candidate and may_be_in_test_window(date_str):
            w = norm_name(current_headers.get("White", ""))
            b = norm_name(current_headers.get("Black", ""))
            candidates = by_players.get((w, b))
            if candidates:
                player_pair_matches += 1
                moves = parse_game_moves_uci(b"".join(current_lines))
                for cand in candidates:
                    prefix = cand["moves_prefix"]
                    if len(moves) >= len(prefix) and moves[: len(prefix)] == prefix:
                        matched_game_ids.add(cand["game_id"])
                        matched_details.append({
                            "game_id": cand["game_id"],
                            "white": cand["white"],
                            "black": cand["black"],
                            "date": date_str,
                            "lumbras_plies": len(moves),
                        })

    with pgn_path.open("rb") as f:
        for line in f:
            if line.startswith(b"[Event "):
                if current_headers:
                    process_record()
                current_headers = {}
                current_lines = [line]
                in_headers = True
                is_candidate = False
                m = TAG_RE.match(line)
                if m:
                    current_headers[m.group(1).decode("ascii", errors="replace")] = m.group(2).decode("utf-8", errors="replace")
            elif in_headers:
                if line.startswith(b"["):
                    current_lines.append(line)
                    m = TAG_RE.match(line)
                    if m:
                        k = m.group(1).decode("ascii", errors="replace")
                        if k in ("Date", "White", "Black"):
                            current_headers[k] = m.group(2).decode("utf-8", errors="replace")
                elif line.strip() == b"":
                    in_headers = False
                    w = norm_name(current_headers.get("White", ""))
                    b = norm_name(current_headers.get("Black", ""))
                    is_candidate = (w, b) in by_players
                    if is_candidate:
                        current_lines.append(line)
                    else:
                        current_lines.clear()
            elif is_candidate:
                current_lines.append(line)
        if current_headers:
            process_record()

    return {
        "pgn_path": str(pgn_path),
        "scan_method": "python_streaming",
        "total_games_scanned": total_games,
        "max_valid_ymd": max_valid_ymd,
        "max_date_tag": max_date,
        "games_date_ge_2026_11": date_ge_2026_11,
        "games_partial_date_maybe_in_window": partial_dates_in_window,
        "test_games_checked": len(games),
        "player_pair_date_matches": player_pair_matches,
        "contaminated_games_count": len(matched_game_ids),
        "contaminated_games": matched_details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Check test game contamination in LumbrasGigabase PGN")
    parser.add_argument("--positions", type=Path, default=DEFAULT_POSITIONS)
    parser.add_argument("--pgn", type=Path, default=DEFAULT_PGN)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    games = load_test_games(args.positions)
    print(f"Loaded {len(games)} unique test games from {args.positions}", flush=True)
    result = scan_pgn_fast_rg(args.pgn, games)
    if result is None:
        result = scan_pgn_python(args.pgn, games)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
