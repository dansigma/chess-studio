"""Evaluate a Maia-3 ONNX model (value + policy) on the SIG-1518 held-out set."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import random
import sys
from time import monotonic

import chess
import numpy as np

THIS_DIR = Path(__file__).resolve().parent
MAIA_DIR = THIS_DIR.parent
sys.path.insert(0, str(MAIA_DIR))

import calibrate  # noqa: E402
import calibrate_combined  # noqa: E402
import move_match  # noqa: E402


def orient_wdl(value_logits: np.ndarray, turn: chess.Color) -> np.ndarray:
    """Convert side-to-move [loss, draw, win] logits to White/Draw/Black probabilities."""
    probs = np.exp(calibrate.log_softmax(value_logits[:3]))
    loss, draw, win = float(probs[0]), float(probs[1]), float(probs[2])
    if turn == chess.WHITE:
        return np.array([win, draw, loss], dtype=np.float64)
    return np.array([loss, draw, win], dtype=np.float64)


def main():
    started = monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgn", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--elo-mode", choices=("mapped", "fide"), default="fide")
    parser.add_argument("--seed", default=1503, type=int)
    parser.add_argument("--per-band", default=20000, type=int)
    parser.add_argument("--out-report", default=None, type=Path)
    args = parser.parse_args()

    calibrate.verify_encoder()
    calibrate.verify_phase()
    move_match.verify_policy_decoding()
    classical = calibrate_combined.load_classical_calibration()

    eligible, sampled = calibrate_combined.sample_games_with_events(
        args.pgn, args.per_band, args.seed
    )
    rng = random.Random(args.seed)
    held_by_band = []
    with args.pgn.open(encoding="utf-8-sig", errors="replace") as stream:
        for band in calibrate.BANDS:
            fit_items, held_items, _, _ = calibrate_combined.split_by_event(sampled[band], rng)
            calibrate_combined.parse_combined_samples(stream, fit_items, rng)
            held_samples, _ = calibrate_combined.parse_combined_samples(stream, held_items, rng)
            held_by_band.append(held_samples)

    rows = []
    with calibrate.Inference(args.model) as session:
        for band, samples in zip(calibrate.BANDS, held_by_band, strict=True):
            eval_elo = band if args.elo_mode == "fide" else classical[band][0]
            if not samples:
                raise ValueError(f"No held-out samples for band {band}")
            weights = np.array([s.weight for s in samples], dtype=np.float64)
            outcomes = np.array([s.outcome for s in samples], dtype=np.int64)
            total_w = float(np.sum(weights))

            wdl_probs = np.empty((len(samples), 3), dtype=np.float64)
            top1 = np.empty(len(samples), dtype=np.float64)
            top3 = np.empty(len(samples), dtype=np.float64)
            logp = np.empty(len(samples), dtype=np.float64)

            idx = 0
            for batch, move_logits, value_logits in session.predict(
                samples, eval_elo, "move_logits", "value_logits"
            ):
                for s, m_log, v_log in zip(batch, move_logits, value_logits, strict=True):
                    wdl_probs[idx] = orient_wdl(v_log, s.turn)
                    legal_ucis, legal_idx = move_match.legal_moves_for_board(chess.Board(s.fen))
                    prob_by_uci, t3 = move_match.decode_policy(m_log, legal_ucis, legal_idx)
                    top1[idx] = 1.0 if t3 and s.played_uci == t3[0] else 0.0
                    top3[idx] = 1.0 if s.played_uci in t3 else 0.0
                    logp[idx] = np.log(max(prob_by_uci.get(s.played_uci, 0.0), move_match.LOG_PROB_CLIP))
                    idx += 1

            nll = float(np.sum(weights * calibrate_combined.weighted_nll_vec(wdl_probs, outcomes)) / total_w)
            obs_draw = float(np.sum(weights * (outcomes == 1)) / total_w)
            pred_draw = float(np.sum(weights * wdl_probs[:, 1]) / total_w)
            ece = calibrate_combined.weighted_ece(wdl_probs, outcomes, weights)
            row = {
                "band": band,
                "elo": eval_elo,
                "n": len(samples),
                "top1": float(np.sum(weights * top1) / total_w),
                "top3": float(np.sum(weights * top3) / total_w),
                "logp": float(np.sum(weights * logp) / total_w),
                "val_loss": nll,
                "obs_draw": obs_draw,
                "pred_draw": pred_draw,
                "ece_mean": float(np.mean(ece)),
            }
            rows.append(row)
            print(
                f"Band {band} (elo={eval_elo}): top1={row['top1']:.2%} top3={row['top3']:.2%} "
                f"logp={row['logp']:.4f} | val_loss={row['val_loss']:.4f} "
                f"draw={row['pred_draw']:.2%} (obs {row['obs_draw']:.2%}) ece={row['ece_mean']:.4f}",
                flush=True,
            )

    if args.out_report is not None:
        date = datetime.now(timezone.utc).date().isoformat()
        lines = [
            f"# Maia-3 Evaluation ({args.model.name}, elo_mode={args.elo_mode})",
            "",
            f"- Date: {date}",
            f"- Model: `{args.model}`",
            f"- Elo mode: `{args.elo_mode}`",
            f"- Eligible games: `{dict(sorted(eligible.items()))}`",
            f"- Runtime: {monotonic() - started:.1f}s",
            "",
            "| Band | Eval Elo | Positions | Top-1 | Top-3 | Mean log-p | Value NLL | Obs draw | Pred draw | Mean ECE |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for r in rows:
            lines.append(
                f"| {r['band']} | {r['elo']} | {r['n']:,} | {r['top1']:.2%} | {r['top3']:.2%} "
                f"| {r['logp']:.4f} | {r['val_loss']:.4f} | {r['obs_draw']:.2%} | {r['pred_draw']:.2%} "
                f"| {r['ece_mean']:.4f} |"
            )
        args.out_report.parent.mkdir(parents=True, exist_ok=True)
        args.out_report.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Wrote {args.out_report}", flush=True)


if __name__ == "__main__":
    main()
