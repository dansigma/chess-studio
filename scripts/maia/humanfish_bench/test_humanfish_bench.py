#!/usr/bin/env python3
"""Self-tests for the HumanFish Nov 2026 sampler and JSONL schema (plain python, no pytest)."""

from __future__ import annotations

import json
import random
import tempfile
import unittest
from pathlib import Path

import chess

import numpy as np

from analyze_results import clustered_bootstrap
from build_positions import build_positions, sample_plies

REQUIRED_KEYS = {
    "id",
    "game_id",
    "tournament",
    "round",
    "white",
    "black",
    "white_elo",
    "black_elo",
    "time_control_class",
    "time_control",
    "ply",
    "moves_uci",
    "fen",
    "played_uci",
    "clock_white_s",
    "clock_black_s",
    "side_to_move",
}


def validate_position_record(rec: dict) -> None:
    keys = set(rec.keys())
    if keys != REQUIRED_KEYS:
        raise AssertionError(f"Schema mismatch: missing={REQUIRED_KEYS - keys}, extra={keys - REQUIRED_KEYS}")
    if rec["id"] != f"{rec['game_id']}:{rec['ply']}":
        raise AssertionError(f"Bad id: {rec['id']}")
    if len(rec["moves_uci"]) != rec["ply"]:
        raise AssertionError(f"len(moves_uci)={len(rec['moves_uci'])} != ply={rec['ply']}")
    board = chess.Board()
    for uci in rec["moves_uci"]:
        board.push_uci(uci)
    if board.fen() != rec["fen"]:
        raise AssertionError(f"FEN mismatch at {rec['id']}")
    played = chess.Move.from_uci(rec["played_uci"])
    if played not in board.legal_moves:
        raise AssertionError(f"Illegal played_uci {rec['played_uci']} at {rec['id']}")
    expected_side = "white" if board.turn == chess.WHITE else "black"
    if rec["side_to_move"] != expected_side:
        raise AssertionError(f"side_to_move={rec['side_to_move']} != {expected_side}")
    if rec["time_control_class"] not in ("classical", "rapid", "blitz"):
        raise AssertionError(f"Invalid time_control_class: {rec['time_control_class']}")


class HumanFishBenchTests(unittest.TestCase):
    def test_sample_plies_determinism_and_buckets(self) -> None:
        a = sample_plies(60, random.Random(1503))
        b = sample_plies(60, random.Random(1503))
        self.assertEqual(a, b)
        self.assertEqual(len(a), 6)
        self.assertTrue(all(12 <= p < 60 for p in a))
        # Strictly increasing across buckets
        self.assertEqual(a, sorted(set(a)))
        # Edge case: 16 plies -> [12, 16) has 4 plies across 6 buckets -> 4 unique plies
        c = sample_plies(16, random.Random(1503))
        self.assertEqual(c, [12, 13, 14, 15])
        # Edge case: 12 plies -> empty
        self.assertEqual(sample_plies(12, random.Random(1503)), [])

    def test_build_positions_filters_and_schema(self) -> None:
        sample_pgn = """\
[Event "Test Tour"]
[Site "London"]
[Date "2026.11.10"]
[Round "1"]
[White "Player A"]
[Black "Player B"]
[Result "1/2-1/2"]
[WhiteElo "2650"]
[BlackElo "2600"]
[TimeControl "5400+30"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 {[%clk 1:29:30]} Nc6 {[%clk 1:29:30]}
3. Bb5 {[%clk 1:29:00]} a6 {[%clk 1:29:00]} 4. Ba4 {[%clk 1:28:30]} Nf6 {[%clk 1:28:30]}
5. O-O {[%clk 1:28:00]} Be7 {[%clk 1:28:00]} 6. Re1 {[%clk 1:27:30]} b5 {[%clk 1:27:30]}
7. Bb3 {[%clk 1:27:00]} d6 {[%clk 1:27:00]} 8. c3 {[%clk 1:26:30]} O-O {[%clk 1:26:30]}
9. h3 {[%clk 1:26:00]} Nb8 {[%clk 1:26:00]} 10. d4 {[%clk 1:25:30]} Nbd7 {[%clk 1:25:30]} 1/2-1/2

[Event "Test Tour"]
[Site "London"]
[Date "2026.11.10"]
[Round "1"]
[White "Player A"]
[Black "Player B"]
[Result "1/2-1/2"]
[WhiteElo "2650"]
[BlackElo "2600"]
[TimeControl "5400+30"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 {[%clk 1:29:30]} Nc6 {[%clk 1:29:30]}
3. Bb5 {[%clk 1:29:00]} a6 {[%clk 1:29:00]} 4. Ba4 {[%clk 1:28:30]} Nf6 {[%clk 1:28:30]}
5. O-O {[%clk 1:28:00]} Be7 {[%clk 1:28:00]} 6. Re1 {[%clk 1:27:30]} b5 {[%clk 1:27:30]}
7. Bb3 {[%clk 1:27:00]} d6 {[%clk 1:27:00]} 8. c3 {[%clk 1:26:30]} O-O {[%clk 1:26:30]}
9. h3 {[%clk 1:26:00]} Nb8 {[%clk 1:26:00]} 10. d4 {[%clk 1:25:30]} Nbd7 {[%clk 1:25:30]} 1/2-1/2

[Event "Test Tour"]
[Site "London"]
[Date "2026.11.10"]
[Round "2"]
[White "Low Elo"]
[Black "Player B"]
[Result "0-1"]
[WhiteElo "2399"]
[BlackElo "2600"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 0-1

[Event "Test Tour"]
[Site "London"]
[Date "2026.10.31"]
[Round "3"]
[White "Player C"]
[Black "Player D"]
[Result "1-0"]
[WhiteElo "2500"]
[BlackElo "2500"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 {[%clk 1:29:30]} Nc6 {[%clk 1:29:30]}
3. Bb5 {[%clk 1:29:00]} a6 {[%clk 1:29:00]} 4. Ba4 {[%clk 1:28:30]} Nf6 {[%clk 1:28:30]}
5. O-O {[%clk 1:28:00]} Be7 {[%clk 1:28:00]} 6. Re1 {[%clk 1:27:30]} b5 {[%clk 1:27:30]}
7. Bb3 {[%clk 1:27:00]} d6 {[%clk 1:27:00]} 8. c3 {[%clk 1:26:30]} O-O {[%clk 1:26:30]} 1-0

[Event "Test Tour"]
[Site "London"]
[Date "2026.11.10"]
[Round "4"]
[White "Player E"]
[Black "Player F"]
[Result "1-0"]
[WhiteElo "2500"]
[BlackElo "2500"]

1. e4 {[%clk 1:30:00]} e5 {[%clk 1:30:00]} 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 1-0
"""
        with tempfile.TemporaryDirectory() as tmp:
            raw_dir = Path(tmp) / "raw"
            raw_dir.mkdir()
            (raw_dir / "t1.pgn").write_text(sample_pgn, encoding="utf-8")
            manifest = {
                "tournaments": [
                    {
                        "id": "t1",
                        "name": "Test Tour",
                        "fide_tc": "standard",
                        "tc": "90+30",
                        "pgn_file": "t1.pgn",
                        "status": "downloaded",
                    }
                ]
            }
            (raw_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            out_jsonl = Path(tmp) / "positions.jsonl"
            summary = build_positions(raw_dir, out_jsonl, seed=1503)

            self.assertEqual(summary["kept_games"], 1)
            self.assertEqual(summary["total_positions"], 6)
            self.assertEqual(summary["filter_drops"]["duplicate"], 1)
            self.assertEqual(summary["filter_drops"]["elo_out_of_range"], 1)
            self.assertEqual(summary["filter_drops"]["date_out_of_range"], 1)
            self.assertEqual(summary["filter_drops"]["clocks_lt_60pct"], 1)

            lines = out_jsonl.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 6)
            for line in lines:
                rec = json.loads(line)
                validate_position_record(rec)

    def test_clustered_bootstrap_determinism(self) -> None:
        rows_by_game = {"g1": [0, 1], "g2": [2, 3]}
        arrays = {
            "m_a:top1": np.array([1.0, 0.0, 1.0, 0.0]),
            "m_a:top3": np.array([1.0, 1.0, 1.0, 1.0]),
            "m_a:log_prob": np.array([-0.5, -1.5, -0.5, -1.5]),
            "m_b:top1": np.array([1.0, 1.0, 1.0, 1.0]),
            "m_b:top3": np.array([1.0, 1.0, 1.0, 1.0]),
            "m_b:log_prob": np.array([-0.2, -0.2, -0.2, -0.2]),
        }
        r1 = clustered_bootstrap(rows_by_game, arrays, baseline_key="m_a", n_boot=200, seed=1503)
        r2 = clustered_bootstrap(rows_by_game, arrays, baseline_key="m_a", n_boot=200, seed=1503)
        self.assertEqual(r1["point"], r2["point"])
        self.assertEqual(r1["ci95"], r2["ci95"])
        self.assertAlmostEqual(r1["point"]["m_a:top1"], 0.5)
        self.assertAlmostEqual(r1["point"]["m_b:top1"], 1.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
