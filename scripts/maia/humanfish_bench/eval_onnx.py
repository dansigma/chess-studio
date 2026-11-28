#!/usr/bin/env python3
"""Evaluate Maia-3 ONNX models (a)-(c) on HumanFish Nov 2026 positions."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts/maia"))

import calibrate  # noqa: E402
import calibrate_combined  # noqa: E402
import move_match  # noqa: E402

DEFAULT_POSITIONS = Path("/home/danilo/data/maia/humanfish-nov2026/positions.jsonl")
DEFAULT_PREDS_DIR = Path("/home/danilo/data/maia/humanfish-nov2026/preds")

MODELS = {
    "5m_classical": {
        "path": Path("/home/danilo/data/maia/maia3-5m.onnx"),
        "classical_map": True,
    },
    "5m_raw": {
        "path": Path("/home/danilo/data/maia/maia3-5m.onnx"),
        "classical_map": False,
    },
    "5m_finetuned": {
        "path": Path("/home/danilo/data/maia/finetuned/maia3-5m-otb-v1.onnx"),
        "classical_map": False,
    },
}

MIN_PROB = 1e-9


def classical_map_elo(elo: int, table: dict[int, tuple[int, float, float]]) -> int:
    band = max(1800, min(2600, (elo // 200) * 200))
    return table[band][0]


def encode_position(moves_uci: list[str]) -> tuple[np.ndarray, list[str], np.ndarray]:
    """Return (tokens [64, 96], legal_ucis, legal_indices) for a position."""
    board = chess.Board()
    # Only need the last 8 boards; still replay from start to keep legality exact
    n_moves = len(moves_uci)
    start_capture = max(0, n_moves - (calibrate.HISTORY - 1))
    history_channels: list[np.ndarray] = []
    if start_capture == 0:
        history_channels.append(calibrate.board_channels(board))
    for idx, uci in enumerate(moves_uci):
        board.push_uci(uci)
        if idx + 1 >= start_capture:
            history_channels.append(calibrate.board_channels(board))
    tokens = calibrate.encode_history(history_channels)
    legal_ucis, legal_indices = move_match.legal_moves_for_board(board)
    return tokens, legal_ucis, legal_indices


def load_positions(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def evaluate_model(
    model_key: str,
    model_path: Path,
    use_classical_map: bool,
    positions: list[dict],
    encoded: list[tuple[np.ndarray, list[str], np.ndarray]],
    classical_table: dict[int, tuple[int, float, float]],
    out_path: Path,
    batch_size: int = 64,
) -> dict:
    options = ort.SessionOptions()
    session = ort.InferenceSession(str(model_path), options, providers=["CPUExecutionProvider"])

    n = len(positions)
    top1_hits = 0
    top3_hits = 0
    log_prob_sum = 0.0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as out_f:
        for start in range(0, n, batch_size):
            end = min(n, start + batch_size)
            batch_pos = positions[start:end]
            batch_enc = encoded[start:end]

            tokens_batch = np.stack([e[0] for e in batch_enc]).astype(np.float32)
            self_elos = []
            oppo_elos = []
            for pos in batch_pos:
                if pos["side_to_move"] == "white":
                    s_elo, o_elo = pos["white_elo"], pos["black_elo"]
                else:
                    s_elo, o_elo = pos["black_elo"], pos["white_elo"]
                if use_classical_map:
                    s_elo = classical_map_elo(s_elo, classical_table)
                self_elos.append(s_elo)
                oppo_elos.append(o_elo)

            logits_move = session.run(
                ["move_logits"],
                {
                    "tokens": tokens_batch,
                    "self_elo": np.array(self_elos, dtype=np.int64),
                    "oppo_elo": np.array(oppo_elos, dtype=np.int64),
                },
            )[0]

            for i, pos in enumerate(batch_pos):
                _, legal_ucis, legal_indices = batch_enc[i]
                prob_by_uci, top3 = move_match.decode_policy(logits_move[i], legal_ucis, legal_indices)
                played = pos["played_uci"]
                p_played = max(prob_by_uci[played], MIN_PROB)
                lp = math.log(p_played)
                t1 = 1 if top3[0] == played else 0
                t3 = 1 if played in top3 else 0
                top1_hits += t1
                top3_hits += t3
                log_prob_sum += lp
                out_f.write(
                    json.dumps(
                        {
                            "id": pos["id"],
                            "game_id": pos["game_id"],
                            "time_control_class": pos["time_control_class"],
                            "top1": t1,
                            "top3": t3,
                            "p_played": p_played,
                            "log_prob": lp,
                            "pred_top3": top3,
                        }
                    )
                    + "\n"
                )

    summary = {
        "model": model_key,
        "n": n,
        "top1": top1_hits / n,
        "top3": top3_hits / n,
        "mean_log_prob": log_prob_sum / n,
    }
    print(json.dumps(summary), flush=True)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Maia-3 ONNX models on HumanFish Nov 2026")
    parser.add_argument("--positions", type=Path, default=DEFAULT_POSITIONS)
    parser.add_argument("--preds-dir", type=Path, default=DEFAULT_PREDS_DIR)
    parser.add_argument("--models", nargs="+", default=list(MODELS.keys()), choices=list(MODELS.keys()))
    args = parser.parse_args()

    calibrate.verify_encoder()
    move_match.verify_policy_decoding()
    classical_table = calibrate_combined.load_classical_calibration()

    positions = load_positions(args.positions)
    print(f"Loaded {len(positions)} positions; encoding history...", flush=True)
    encoded = [encode_position(p["moves_uci"]) for p in positions]
    print("Encoding complete.", flush=True)

    for key in args.models:
        cfg = MODELS[key]
        evaluate_model(
            model_key=key,
            model_path=cfg["path"],
            use_classical_map=cfg["classical_map"],
            positions=positions,
            encoded=encoded,
            classical_table=classical_table,
            out_path=args.preds_dir / f"{key}.jsonl",
        )


if __name__ == "__main__":
    main()
