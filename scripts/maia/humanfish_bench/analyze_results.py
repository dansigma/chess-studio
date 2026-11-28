#!/usr/bin/env python3
"""Compute game-clustered bootstrap metrics, parity check, and generate report.md."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

DEFAULT_POSITIONS = Path("/home/danilo/data/maia/humanfish-nov2026/positions.jsonl")
DEFAULT_SUMMARY = Path("/home/danilo/data/maia/humanfish-nov2026/positions_summary.json")
DEFAULT_MANIFEST = Path("/home/danilo/data/maia/humanfish-nov2026/raw/manifest.json")
DEFAULT_CONTAMINATION = Path("/home/danilo/data/maia/humanfish-nov2026/contamination.json")
DEFAULT_PREDS_DIR = Path("/home/danilo/data/maia/humanfish-nov2026/preds")
DEFAULT_REPORT = Path(__file__).resolve().parent / "report.md"
DEFAULT_METRICS_JSON = Path("/home/danilo/data/maia/humanfish-nov2026/metrics_summary.json")

MODEL_ORDER = [
    ("5m_classical", "(a) Maia-3 5M ONNX (Classical 2900)"),
    ("5m_raw", "(b) Maia-3 5M ONNX (Raw FIDE)"),
    ("5m_finetuned", "(c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE)"),
    ("maia3-23m", "(d) Maia-3 23M PyTorch GPU (Raw FIDE)"),
    ("maia3-79m", "(e) Maia-3 79M PyTorch GPU (Raw FIDE)"),
    ("toby2_accurate", "(f) Toby 2 Accurate (unmodified, RTX 3090)"),
]

TC_CLASSES = ["overall", "classical", "rapid", "blitz"]


def load_preds(path: Path) -> dict[str, dict]:
    preds = {}
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            preds[row["id"]] = row
    return preds


def clustered_bootstrap(
    rows_by_game: dict[str, list[int]],
    arrays: dict[str, np.ndarray],
    baseline_key: str,
    n_boot: int = 1000,
    seed: int = 1503,
) -> dict:
    game_ids = sorted(rows_by_game.keys())
    g_count = len(game_ids)
    counts = np.array([len(rows_by_game[g]) for g in game_ids], dtype=np.float64)

    # Aggregate per-game sums for each metric vector
    game_sums: dict[str, np.ndarray] = {}
    for name, vec in arrays.items():
        gs = np.array([vec[rows_by_game[g]].sum() for g in game_ids], dtype=np.float64)
        game_sums[name] = gs

    total_n = float(counts.sum())
    point = {name: float(gs.sum() / total_n) for name, gs in game_sums.items()}

    rng = np.random.default_rng(seed)
    boot_indices = rng.integers(0, g_count, size=(n_boot, g_count))
    boot_denoms = counts[boot_indices].sum(axis=1)

    ci = {}
    diff_ci = {}
    diff_point = {}
    for name, gs in game_sums.items():
        boot_vals = gs[boot_indices].sum(axis=1) / boot_denoms
        ci[name] = [float(np.percentile(boot_vals, 2.5)), float(np.percentile(boot_vals, 97.5))]

    # Paired differences vs baseline_key for each metric
    for metric in ("top1", "top3", "log_prob"):
        base_name = f"{baseline_key}:{metric}"
        base_gs = game_sums[base_name]
        base_boot = base_gs[boot_indices].sum(axis=1) / boot_denoms
        for model_key, _ in MODEL_ORDER:
            name = f"{model_key}:{metric}"
            if name not in game_sums:
                continue
            diff_point[name] = point[name] - point[base_name]
            if model_key == baseline_key:
                diff_ci[name] = [0.0, 0.0]
            else:
                m_boot = game_sums[name][boot_indices].sum(axis=1) / boot_denoms - base_boot
                diff_ci[name] = [float(np.percentile(m_boot, 2.5)), float(np.percentile(m_boot, 97.5))]

    return {
        "n_positions": int(total_n),
        "n_games": g_count,
        "point": point,
        "ci95": ci,
        "diff_vs_a": diff_point,
        "diff_vs_a_ci95": diff_ci,
    }


def fmt_pct(val: float, ci: list[float]) -> str:
    return f"{val * 100:.2f}% [{ci[0] * 100:.2f}%, {ci[1] * 100:.2f}%]"


def fmt_lp(val: float, ci: list[float]) -> str:
    return f"{val:.4f} [{ci[0]:.4f}, {ci[1]:.4f}]"


def fmt_diff_pct(val: float, ci: list[float]) -> str:
    return f"{val * 100:+.2f} pp [{ci[0] * 100:+.2f}, {ci[1] * 100:+.2f}]"


def fmt_diff_lp(val: float, ci: list[float]) -> str:
    return f"{val:+.4f} [{ci[0]:+.4f}, {ci[1]:+.4f}]"


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze results and generate report.md")
    parser.add_argument("--positions", type=Path, default=DEFAULT_POSITIONS)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--contamination", type=Path, default=DEFAULT_CONTAMINATION)
    parser.add_argument("--preds-dir", type=Path, default=DEFAULT_PREDS_DIR)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--metrics-json", type=Path, default=DEFAULT_METRICS_JSON)
    parser.add_argument("--n-boot", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=1503)
    args = parser.parse_args()

    positions = [json.loads(line) for line in args.positions.read_text(encoding="utf-8").splitlines() if line.strip()]
    pos_ids = [p["id"] for p in positions]
    pos_summary = json.loads(args.summary.read_text(encoding="utf-8"))
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    contamination = json.loads(args.contamination.read_text(encoding="utf-8"))

    # Load all model predictions + optional 5m PyTorch parity predictions
    loaded_preds: dict[str, dict[str, dict]] = {}
    for key, _ in MODEL_ORDER:
        p = args.preds_dir / f"{key}.jsonl"
        if p.exists():
            loaded_preds[key] = load_preds(p)
        else:
            raise FileNotFoundError(f"Missing predictions file: {p}")

    parity = None
    pt_5m_path = args.preds_dir / "maia3-5m.jsonl"
    if pt_5m_path.exists() and "5m_raw" in loaded_preds:
        pt_5m = load_preds(pt_5m_path)
        onnx_5m = loaded_preds["5m_raw"]
        t1_agree = sum(1 for pid in pos_ids if pt_5m[pid]["pred_top3"][0] == onnx_5m[pid]["pred_top3"][0])
        lp_diffs = [abs(pt_5m[pid]["log_prob"] - onnx_5m[pid]["log_prob"]) for pid in pos_ids]
        pt_t1 = sum(pt_5m[pid]["top1"] for pid in pos_ids) / len(pos_ids)
        ox_t1 = sum(onnx_5m[pid]["top1"] for pid in pos_ids) / len(pos_ids)
        pt_lp = sum(pt_5m[pid]["log_prob"] for pid in pos_ids) / len(pos_ids)
        ox_lp = sum(onnx_5m[pid]["log_prob"] for pid in pos_ids) / len(pos_ids)
        parity = {
            "n": len(pos_ids),
            "onnx_top1": ox_t1,
            "pytorch_top1": pt_t1,
            "top1_agreement": t1_agree / len(pos_ids),
            "onnx_mean_log_prob": ox_lp,
            "pytorch_mean_log_prob": pt_lp,
            "mean_abs_log_prob_diff": float(np.mean(lp_diffs)),
            "max_abs_log_prob_diff": float(np.max(lp_diffs)),
        }

    # Build aligned metric vectors
    arrays: dict[str, np.ndarray] = {}
    for key, _ in MODEL_ORDER:
        pmap = loaded_preds[key]
        arrays[f"{key}:top1"] = np.array([pmap[pid]["top1"] for pid in pos_ids], dtype=np.float64)
        arrays[f"{key}:top3"] = np.array([pmap[pid]["top3"] for pid in pos_ids], dtype=np.float64)
        arrays[f"{key}:log_prob"] = np.array([pmap[pid]["log_prob"] for pid in pos_ids], dtype=np.float64)

    if not positions:
        raise SystemExit(f"No positions found in {args.positions}")
    results_by_slice: dict[str, dict] = {}
    for tc in TC_CLASSES:
        rows_by_game: dict[str, list[int]] = defaultdict(list)
        for idx, p in enumerate(positions):
            if tc == "overall" or p["time_control_class"] == tc:
                rows_by_game[p["game_id"]].append(idx)
        if not rows_by_game:
            print(f"Warning: no positions for slice {tc!r}; skipping", file=sys.stderr)
            continue
        results_by_slice[tc] = clustered_bootstrap(
            rows_by_game,
            arrays,
            baseline_key="5m_classical",
            n_boot=args.n_boot,
            seed=args.seed,
        )

    metrics_out = {
        "parity_5m_onnx_vs_pytorch": parity,
        "slices": results_by_slice,
        "positions_summary": pos_summary,
        "contamination": contamination,
    }
    args.metrics_json.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.metrics_json.write_text(json.dumps(metrics_out, indent=2), encoding="utf-8")

    # Build Markdown report
    lines: list[str] = []
    lines.append("# HumanFish November 2026 Move-Prediction Benchmark (SIG-1531)\n")
    lines.append(
        "Replication of HumanFish's November 2026 prospective move-prediction test set "
        "(`2026-11-01` to `2026-11-26`) and evaluation of Maia-3 models (5M ONNX, 5M OTB-v1 fine-tuned ONNX, 23M PyTorch, 79M PyTorch) and Toby 2 Accurate (run unmodified as a UCI engine; Toby © Yosha Iglesias, toby.tribychess.org).\n"
    )

    lines.append("## 1. Dataset & Filtering Summary\n")
    lines.append(
        f"- **Tournaments downloaded:** {manifest['downloaded']}/{manifest['total_requested']} "
        f"(missing: {', '.join(manifest['missing']) if manifest['missing'] else 'none'})"
    )
    lines.append(f"- **Raw PGN games:** {pos_summary['total_raw_games']}")
    lines.append(
        f"- **Kept games / sampled positions:** **{pos_summary['kept_games']} games / {pos_summary['total_positions']} positions** "
        f"(seed `{pos_summary['seed']}`)"
    )
    lines.append(
        f"- **Published references:** HumanFish reported 450 games / 2,698 positions (13 tournaments); "
        f"Toby 2 reported 523 games / 3,136 positions (12/13 tournaments)."
    )
    lines.append("- **Filter drops:**")
    for k, v in pos_summary["filter_drops"].items():
        lines.append(f"  - `{k}`: {v}")
    lines.append("- **Positions per time-control class:**")
    for tc in ("classical", "rapid", "blitz"):
        cnt = pos_summary["positions_per_time_control_class"].get(tc, 0)
        pct = 100.0 * cnt / pos_summary["total_positions"]
        lines.append(f"  - `{tc}`: {cnt} ({pct:.1f}%)")
    lines.append("\n### Games & Positions per Tournament\n")
    lines.append("| Tournament | ID | Raw Games | Kept Games | Sampled Positions |")
    lines.append("| --- | --- | ---: | ---: | ---: |")
    for entry in manifest["tournaments"]:
        tname = entry["name"] or entry["query_name"]
        tid = entry["id"] or "—"
        raw_g = entry["game_count"]
        kept_g = pos_summary["games_per_tournament"].get(tname, 0)
        pos_c = pos_summary["positions_per_tournament"].get(tname, 0)
        lines.append(f"| {tname} | `{tid}` | {raw_g} | {kept_g} | {pos_c} |")

    lines.append("\n## 2. Contamination Check (`LumbrasGigabase_OTB_Complete.pgn`)\n")
    lines.append(
        f"- **Total games scanned:** {contamination['total_games_scanned']:,}\n"
        f"- **Max valid `YYYY.MM.DD` date in PGN:** `{contamination['max_valid_ymd']}` "
        f"(games with `Date >= 2026.11`: {contamination['games_date_ge_2026_11']})\n"
        f"- **Games with a partial date (`?`) that could fall in the test window:** "
        f"{contamination.get('games_partial_date_maybe_in_window', 0):,}; these were checked by players and moves too\n"
        f"- **Matched test games (players + compatible date + moves):** **{contamination['contaminated_games_count']}** / {contamination['test_games_checked']}"
    )

    if parity is not None:
        lines.append("\n## 3. PyTorch vs ONNX Parity Check (Maia-3 5M, Raw FIDE)\n")
        lines.append(
            f"- **Positions:** {parity['n']}\n"
            f"- **ONNX 5M Top-1:** {parity['onnx_top1'] * 100:.2f}% | **PyTorch 5M Top-1:** {parity['pytorch_top1'] * 100:.2f}% "
            f"(exact top-1 move agreement: {parity['top1_agreement'] * 100:.2f}%)\n"
            f"- **ONNX 5M Mean Log-Prob:** {parity['onnx_mean_log_prob']:.6f} | **PyTorch 5M Mean Log-Prob:** {parity['pytorch_mean_log_prob']:.6f} "
            f"(mean |Δ|: {parity['mean_abs_log_prob_diff']:.2e}, max |Δ|: {parity['max_abs_log_prob_diff']:.2e})"
        )

    lines.append(f"\n## 4. Model Evaluation (95% Game-Clustered Bootstrap CIs, {args.n_boot:,} Resamples, Seed {args.seed})\n")
    for tc in TC_CLASSES:
        if tc not in results_by_slice:
            continue
        sl = results_by_slice[tc]
        lines.append(f"### {tc.capitalize()} (N = {sl['n_positions']} positions, {sl['n_games']} games)\n")
        lines.append("| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for key, label in MODEL_ORDER:
            t1 = fmt_pct(sl["point"][f"{key}:top1"], sl["ci95"][f"{key}:top1"])
            t3 = fmt_pct(sl["point"][f"{key}:top3"], sl["ci95"][f"{key}:top3"])
            lp = fmt_lp(sl["point"][f"{key}:log_prob"], sl["ci95"][f"{key}:log_prob"])
            if key == "5m_classical":
                dt1 = "—"
                dlp = "—"
            else:
                dt1 = fmt_diff_pct(sl["diff_vs_a"][f"{key}:top1"], sl["diff_vs_a_ci95"][f"{key}:top1"])
                dlp = fmt_diff_lp(sl["diff_vs_a"][f"{key}:log_prob"], sl["diff_vs_a_ci95"][f"{key}:log_prob"])
            lines.append(f"| {label} | {t1} | {t3} | {lp} | {dt1} | {dlp} |")
        lines.append("")

    ov = results_by_slice["overall"]["point"]
    lines.append("## 5. Published Numbers vs Ours\n")
    lines.append("| Model / System | Published Top-1 | Published Top-3 | Our Top-1 (All) | Our Top-3 (All) | Notes |")
    lines.append("| --- | ---: | ---: | ---: | ---: | --- |")
    lines.append("| HumanFish (Nov 2026, N=2,698) | 65.9% | — | — | — | Published on humanfish.vercel.app |")
    lines.append("| DSC-150M (Nov 2026, N=2,698) | 63.0% | — | — | — | Published on humanfish.vercel.app |")
    lines.append(
        f"| Toby 2 Accurate (Nov 2026, N=3,136) | 67.5% | 92.6% | {ov['toby2_accurate:top1'] * 100:.2f}% | "
        f"{ov['toby2_accurate:top3'] * 100:.2f}% | Published: 523 games, 12/13 tournaments; ours: run unmodified on the same positions |"
    )
    lines.append(
        f"| Maia-3 79M (Raw FIDE) | 57.2% | — | {ov['maia3-79m:top1'] * 100:.2f}% | {ov['maia3-79m:top3'] * 100:.2f}% | "
        f"Published: 5-fold tournament-recalibrated on N=2,698 |"
    )
    lines.append(
        f"| Maia-3 23M (Raw FIDE) | 55.6% | — | {ov['maia3-23m:top1'] * 100:.2f}% | {ov['maia3-23m:top3'] * 100:.2f}% | "
        f"Published: 5-fold tournament-recalibrated on N=2,698 |"
    )
    lines.append(
        f"| Maia-3 5M ONNX (Classical 2900) | — | — | {ov['5m_classical:top1'] * 100:.2f}% | {ov['5m_classical:top3'] * 100:.2f}% | "
        f"Both FIDE ratings mapped via classical-calibration.ts |"
    )
    lines.append(
        f"| Maia-3 5M ONNX (Raw FIDE) | — | — | {ov['5m_raw:top1'] * 100:.2f}% | {ov['5m_raw:top3'] * 100:.2f}% | Uncalibrated FIDE |"
    )
    lines.append(
        f"| Maia-3 5M Finetuned OTB-v1 ONNX | — | — | {ov['5m_finetuned:top1'] * 100:.2f}% | {ov['5m_finetuned:top3'] * 100:.2f}% | "
        f"Fine-tuned on LumbrasGigabase OTB |"
    )

    lines.append("\n## 6. Methodological Differences & Caveats\n")
    lines.append(
        "- **Tournament coverage:** All 13 tournaments from `prospective_nov2026_report.json` were found and downloaded via the Lichess broadcast API "
        f"(whereas Toby 2 reported 12/13). Our dataset has {pos_summary['kept_games']:,} games / {pos_summary['total_positions']:,} positions vs HumanFish's 450 games / 2,698 positions and Toby 2's 523 games / 3,136 positions.\n"
        "- **Sampling seed:** We sampled 1 ply uniformly from each of 6 equal buckets over `[12, total_plies - 1]` with deterministic seed `1503`; "
        "HumanFish's exact random seed and exact start ply (`after move 6` = ply 12) may differ slightly in bucket boundaries. "
        "A game shorter than 18 plies has fewer than 6 plies to sample, so it contributes fewer positions (one game here gives 4).\n"
        "- **Time-control classification:** Lichess broadcast `fideTC` metadata mislabeled `Total Chess World Championship Tour Pilot 2026 | Finals` as `standard` "
        "(despite containing `180+2`, `900+10`, `600`, and `2700+30` games) and `WR Women's Chess Tour 2026 - Grand Final | Rapid` as `blitz`. "
        "We therefore inferred `time_control_class` primarily from the PGN `TimeControl` tag, falling back to the initial `%clk` timestamp when `TimeControl` is `?`, "
        "and finally to tournament name / `fideTC`.\n"
        "- **Classical mapping for (a):** `classical-calibration.ts` maps FIDE bands `2400` and `2600+` to `2900`. As on the site, we applied this mapping to both players and passed the mapped rating as `self_elo` and `oppo_elo`.\n"
        f"- **Confidence intervals:** We used game-clustered bootstrap ({args.n_boot:,} resamples, seed `{args.seed}`); HumanFish also noted that tournament-clustered intervals are wider than game-clustered intervals."
    )
    lines.append(
        "- **Toby 2:** run unmodified as a UCI engine (Linux full release 2.0, `Toby 2 Product = Accurate`, FIDE ratings, "
        "time control, base time/increment and game clocks from the PGN, `MultiPV 500`). Probabilities are Toby's listed "
        "moves; a played move it does not list (10 of 3,196 positions) gets the `1e-9` floor, which only affects log-prob. "
        "A first run under systemd fell back silently to `Standard` because the GPU tools were not on `PATH`; on the same "
        "positions Standard scored 67.43% top-1 / 92.68% top-3, almost the same as Accurate. The runner now aborts on that fallback."
    )

    lines.append("\n## 7. Reproduction Commands\n")
    lines.append("```bash")
    lines.append("# 1. Download Lichess broadcast PGNs")
    lines.append("/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/download_tournaments.py")
    lines.append("")
    lines.append("# 2. Build positions.jsonl (seed 1503)")
    lines.append("/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/build_positions.py")
    lines.append("")
    lines.append("# 3. Check contamination in LumbrasGigabase_OTB_Complete.pgn")
    lines.append("/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/check_contamination.py")
    lines.append("")
    lines.append("# 4. Evaluate ONNX models (a)-(c) on VM CPU")
    lines.append("/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/eval_onnx.py")
    lines.append("")
    lines.append("# 5. Evaluate PyTorch models (5m parity, 23m, 79m) on desktop GPU")
    lines.append("# ~/maia-ft/.venv/bin/python ~/humanfish-nov2026/eval_pytorch.py --model maia3-5m --positions ~/humanfish-nov2026/positions.jsonl --out ~/humanfish-nov2026/preds/maia3-5m.jsonl")
    lines.append("# ~/maia-ft/.venv/bin/python ~/humanfish-nov2026/eval_pytorch.py --model maia3-23m --positions ~/humanfish-nov2026/positions.jsonl --out ~/humanfish-nov2026/preds/maia3-23m.jsonl")
    lines.append("# ~/maia-ft/.venv/bin/python ~/humanfish-nov2026/eval_pytorch.py --model maia3-79m --positions ~/humanfish-nov2026/positions.jsonl --out ~/humanfish-nov2026/preds/maia3-79m.jsonl")
    lines.append("")
    lines.append("# 5b. Toby 2 Accurate on the desktop GPU (see TOBY.md), then convert its output")
    lines.append("# ~/toby/bench/run_toby_systemd.sh ~/toby/bench/nov2026/positions.jsonl ~/toby/bench/nov2026/toby_predictions.jsonl")
    lines.append("# copy toby_predictions.jsonl to /home/danilo/data/maia/humanfish-nov2026/toby_raw.jsonl, then:")
    lines.append("/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/convert_toby.py")
    lines.append("")
    lines.append("# 6. Compute bootstrap CIs and generate report.md")
    lines.append("/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/analyze_results.py")
    lines.append("")
    lines.append("# 7. Run self-tests")
    lines.append("/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/test_humanfish_bench.py")
    lines.append("```")

    args.report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote report to {args.report} and metrics to {args.metrics_json}")


if __name__ == "__main__":
    main()
