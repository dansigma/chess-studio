#!/usr/bin/env python3
"""Evaluate upstream PyTorch Maia-3 models on HumanFish Nov 2026 positions (runs on GPU box)."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import chess
import numpy as np
import torch
from maia3.model_registry import resolve_checkpoint_path
from maia3.uci import load_model, parse_args

HISTORY = 8
WIDTH = HISTORY * 12
PROMO_PIECES = (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT)
MIN_PROB = 1e-9


def board_channels(board: chess.Board) -> np.ndarray:
    channels = np.zeros((64, 12), dtype=np.uint8)
    mirror = 0 if board.turn == chess.WHITE else 56
    for square, piece in board.piece_map().items():
        channel = piece.piece_type - 1 + (0 if piece.color == board.turn else 6)
        channels[square ^ mirror, channel] = 1
    return channels


def encode_history(history: list[np.ndarray]) -> np.ndarray:
    tokens = np.zeros((64, WIDTH), dtype=np.uint8)
    history = history[-HISTORY:]
    padded = [history[0]] * (HISTORY - len(history)) + history
    tokens[:, : HISTORY * 12] = np.concatenate(padded, axis=1)
    return tokens


def move_index(move: chess.Move, turn: bool) -> int:
    if move.promotion:
        source = chess.square_file(move.from_square)
        target = chess.square_file(move.to_square)
        promotion = PROMO_PIECES.index(move.promotion)
        return 4096 + (source * 8 + target) * 4 + promotion
    mirror = 0 if turn == chess.WHITE else 56
    return (move.from_square ^ mirror) * 64 + (move.to_square ^ mirror)


def legal_moves_for_board(board: chess.Board) -> tuple[list[str], np.ndarray]:
    ucis = []
    indices = []
    for move in board.legal_moves:
        ucis.append(move.uci())
        indices.append(move_index(move, board.turn))
    return ucis, np.array(indices, dtype=np.int64)


def log_softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits.astype(np.float64) - np.max(logits, axis=-1, keepdims=True)
    return shifted - np.log(np.exp(shifted).sum(axis=-1, keepdims=True))


def decode_policy(
    logits: np.ndarray, legal_ucis: list[str], legal_indices: np.ndarray
) -> tuple[dict[str, float], list[str]]:
    legal_logits = logits[legal_indices]
    probs = np.exp(log_softmax(legal_logits))
    order = np.argsort(-probs, kind="stable")
    top3 = [legal_ucis[i] for i in order[:3]]
    prob_by_uci = {legal_ucis[i]: float(probs[i]) for i in range(len(legal_ucis))}
    return prob_by_uci, top3


def encode_position(moves_uci: list[str]) -> tuple[np.ndarray, list[str], np.ndarray]:
    board = chess.Board()
    n_moves = len(moves_uci)
    start_capture = max(0, n_moves - (HISTORY - 1))
    history_channels: list[np.ndarray] = []
    if start_capture == 0:
        history_channels.append(board_channels(board))
    for idx, uci in enumerate(moves_uci):
        board.push_uci(uci)
        if idx + 1 >= start_capture:
            history_channels.append(board_channels(board))
    tokens = encode_history(history_channels)
    legal_ucis, legal_indices = legal_moves_for_board(board)
    return tokens, legal_ucis, legal_indices


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate PyTorch maia3 model")
    parser.add_argument("--model", required=True, help="maia3-5m | maia3-23m | maia3-79m")
    parser.add_argument("--positions", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    cfg = parse_args(["--model", args.model])
    if cfg.checkpoint_path is None:
        spec = getattr(cfg, "model_spec", None)
        if spec is None:
            raise RuntimeError(f"Could not resolve model spec for {args.model}")
        cfg.checkpoint_path = resolve_checkpoint_path(
            spec,
            checkpoint_filename=cfg.checkpoint_filename,
            cache_dir=cfg.cache_dir,
            revision=cfg.revision,
            local_files_only=cfg.local_files_only,
            force_download=cfg.force_download,
            token=cfg.hf_token,
        )
    model = load_model(cfg)
    model.eval()
    device = next(model.parameters()).device
    print(f"Loaded {args.model} on {device} from {cfg.checkpoint_path}", flush=True)

    positions = [json.loads(line) for line in args.positions.read_text(encoding="utf-8").splitlines() if line.strip()]
    encoded = [encode_position(p["moves_uci"]) for p in positions]
    n = len(positions)
    top1_hits = 0
    top3_hits = 0
    log_prob_sum = 0.0

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as out_f, torch.no_grad():
        for start in range(0, n, args.batch_size):
            end = min(n, start + args.batch_size)
            batch_pos = positions[start:end]
            batch_enc = encoded[start:end]

            tokens_t = torch.from_numpy(np.stack([e[0] for e in batch_enc]).astype(np.float32)).to(device)
            self_elos = []
            oppo_elos = []
            for pos in batch_pos:
                if pos["side_to_move"] == "white":
                    self_elos.append(pos["white_elo"])
                    oppo_elos.append(pos["black_elo"])
                else:
                    self_elos.append(pos["black_elo"])
                    oppo_elos.append(pos["white_elo"])
            self_t = torch.tensor(self_elos, dtype=torch.long, device=device)
            oppo_t = torch.tensor(oppo_elos, dtype=torch.long, device=device)

            logits_move, _, _ = model(tokens_t, self_t, oppo_t)
            logits_np = logits_move.detach().float().cpu().numpy()

            for i, pos in enumerate(batch_pos):
                _, legal_ucis, legal_indices = batch_enc[i]
                prob_by_uci, top3 = decode_policy(logits_np[i], legal_ucis, legal_indices)
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

    print(
        json.dumps(
            {
                "model": args.model,
                "n": n,
                "top1": top1_hits / n,
                "top3": top3_hits / n,
                "mean_log_prob": log_prob_sum / n,
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
