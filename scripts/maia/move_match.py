"""Measure how well Maia-3's policy predicts classical OTB moves across FIDE bands."""

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import random
import shlex
import sys
from time import monotonic

import chess
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import calibrate  # noqa: E402
import calibrate_combined  # noqa: E402


ROOT = calibrate.ROOT
BANDS = calibrate.BANDS
DEFAULT_TEST_ELOS = "1800,2000,2200,2300,2500,2700,2900"
FIDE_TEST_ELOS = ",".join(str(band) for band in sorted(set(BANDS)))
DEFAULT_CACHE_DIR = calibrate_combined.DEFAULT_CACHE_DIR
LOG_PROB_CLIP = 1e-9
# A switch is only worth a separate mapping when the gain is both detectable
# (95% CI above 0) and practically relevant (mean log-prob gain >= this many nats).
MIN_PRACTICAL_LOGP_GAIN = 0.02
PHASE_BUCKETS = (
    ("≥0.75", lambda phase: phase >= 0.75),
    ("0.4–<0.75", lambda phase: (phase >= 0.4) & (phase < 0.75)),
    ("<0.4", lambda phase: phase < 0.4),
)


def parse_test_elos(value):
    """Parse a comma-separated list of model Elos within the Maia-3 rating range."""
    try:
        ratings = tuple(int(item) for item in value.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError("expected comma-separated integer ratings") from None
    if not ratings or ratings != tuple(sorted(set(ratings))) or not (
        calibrate.RATINGS[0] <= ratings[0] and ratings[-1] <= calibrate.RATINGS[-1]
    ):
        raise argparse.ArgumentTypeError(
            "expected strictly increasing ratings from 1500 through 3000"
        )
    return ratings


def legal_moves_for_board(board):
    """Return parallel lists of UCI strings and Maia vocabulary indices for legal moves."""
    ucis = []
    indices = []
    for move in board.legal_moves:
        ucis.append(move.uci())
        indices.append(calibrate.move_index(move, board.turn))
    return ucis, np.array(indices, dtype=np.int64)


def decode_policy(logits, legal_ucis, legal_indices):
    """Mask move logits to legal moves, renormalise via softmax, and return probs and top-3 UCIs."""
    legal_logits = logits[legal_indices]
    probs = np.exp(calibrate.log_softmax(legal_logits))
    order = np.argsort(-probs, kind="stable")
    top3 = [legal_ucis[i] for i in order[:3]]
    prob_by_uci = {legal_ucis[i]: float(probs[i]) for i in range(len(legal_ucis))}
    return prob_by_uci, top3


def verify_policy_decoding():
    """Verify legal-move masking, mirroring, and softmax decoding against encoder fixtures."""
    path = ROOT / "src/engine/maia/fixtures/encoder.json"
    fixtures = json.loads(path.read_text(encoding="utf-8"))
    for fixture in fixtures:
        board = chess.Board(fixture["fens"][-1])
        legal_ucis, legal_indices = legal_moves_for_board(board)
        if sorted(legal_indices.tolist()) != fixture["legalIndices"]:
            raise ValueError(f"Legal indices mismatch for {fixture['name']}")
        if len(set(legal_ucis)) != len(legal_ucis):
            raise ValueError(f"Duplicate UCI moves for {fixture['name']}")

        vocab_size = max(4352, int(legal_indices.max()) + 1)
        base_logits = np.linspace(-2.0, 2.0, vocab_size, dtype=np.float32)
        prob_a, top3_a = decode_policy(base_logits, legal_ucis, legal_indices)
        if not np.isclose(sum(prob_a.values()), 1.0, atol=1e-6):
            raise ValueError(f"Policy probabilities do not sum to 1 for {fixture['name']}")

        # Illegal logits must have zero effect on masked softmax probabilities.
        perturbed = base_logits.copy()
        illegal_mask = np.ones(vocab_size, dtype=bool)
        illegal_mask[legal_indices] = False
        perturbed[illegal_mask] = 1000.0
        prob_b, top3_b = decode_policy(perturbed, legal_ucis, legal_indices)
        if top3_a != top3_b or any(
            not np.isclose(prob_a[u], prob_b[u], atol=1e-7) for u in legal_ucis
        ):
            raise ValueError(f"Illegal logits leaked into policy for {fixture['name']}")

        # Boosting a specific legal move must make it top-1 with matching manual softmax.
        boosted = base_logits.copy()
        target_pos = len(legal_ucis) // 2
        boosted[legal_indices[target_pos]] = 50.0
        prob_c, top3_c = decode_policy(boosted, legal_ucis, legal_indices)
        if top3_c[0] != legal_ucis[target_pos]:
            raise ValueError(f"Boosted move was not top-1 for {fixture['name']}")
        expected_max = np.exp(
            50.0 - np.max(boosted[legal_indices])
        ) / np.sum(np.exp(boosted[legal_indices].astype(np.float64) - 50.0))
        if not np.isclose(prob_c[legal_ucis[target_pos]], expected_max, atol=1e-7):
            raise ValueError(f"Softmax mismatch for {fixture['name']}")

    print(f"Policy decoding verified against {len(fixtures)} fixtures", flush=True)


def load_policy_cache(path):
    """Load cached (token_hash, played_uci, elo) -> (p_played, top3) entries from JSONL."""
    cache = {}
    if not path.exists():
        return cache
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                cache[(rec["key"], rec["played_uci"], int(rec["elo"]))] = (
                    float(rec["p_played"]),
                    list(rec["top3"]),
                )
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
    return cache


def evaluate_policy_cached(session, held_by_band, test_elos, cache_path):
    """Run batched Maia policy inference on uncached (position, elo) pairs and cache results."""
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache = load_policy_cache(cache_path)

    # Deduplicate ONNX forward passes by (elo, token_hash) while keeping all needed
    # samples so duplicate token_hashes with different played moves are all scored.
    todo_by_elo = defaultdict(lambda: defaultdict(list))
    total_unique = 0
    for held_samples in held_by_band:
        for s in held_samples:
            for elo in test_elos:
                if (s.token_hash, s.played_uci, elo) not in cache:
                    bucket = todo_by_elo[elo][s.token_hash]
                    if not bucket:
                        total_unique += 1
                    bucket.append(s)

    print(
        f"Maia policy cache: {total_unique:,} unique (position, modelElo) pairs to evaluate",
        flush=True,
    )
    if total_unique == 0:
        return cache, 0, 0.0

    legal_cache = {}
    done = 0
    started = monotonic()
    last_log = started
    with cache_path.open("a", encoding="utf-8") as cache_file:
        for elo in test_elos:
            hash_map = todo_by_elo.get(elo)
            if not hash_map:
                continue
            unique_samples = [group[0] for group in hash_map.values()]
            for batch, logits in session.predict(unique_samples, elo, "move_logits"):
                lines = []
                for rep_sample, row in zip(batch, logits, strict=True):
                    for s in hash_map[rep_sample.token_hash]:
                        if s.fen not in legal_cache:
                            legal_cache[s.fen] = legal_moves_for_board(chess.Board(s.fen))
                        legal_ucis, legal_indices = legal_cache[s.fen]
                        prob_by_uci, top3 = decode_policy(row, legal_ucis, legal_indices)
                        p_played = prob_by_uci[s.played_uci]
                        cache[(s.token_hash, s.played_uci, elo)] = (p_played, top3)
                        lines.append(
                            json.dumps(
                                {
                                    "key": s.token_hash,
                                    "elo": elo,
                                    "played_uci": s.played_uci,
                                    "p_played": p_played,
                                    "top3": top3,
                                }
                            )
                            + "\n"
                        )
                cache_file.writelines(lines)
                cache_file.flush()
                done += len(batch)
                now = monotonic()
                if done == total_unique or now - last_log >= 5.0:
                    elapsed = now - started
                    rate = done / elapsed if elapsed > 0 else 0.0
                    eta = (total_unique - done) / rate if rate > 0 else float("inf")
                    print(
                        f"Maia policy: {done:,}/{total_unique:,} ({done / total_unique:.1%}) "
                        f"| {rate:.1f} pos/s | elapsed {calibrate_combined.format_eta(elapsed)} "
                        f"| ETA {calibrate_combined.format_eta(eta)}",
                        flush=True,
                    )
                    last_log = now
    elapsed = monotonic() - started
    rate = total_unique / elapsed if elapsed > 0 else 0.0
    return cache, total_unique, rate


def weighted_metrics(top1_vec, top3_vec, logp_vec, weights):
    """Compute weighted top-1, top-3, and mean log-prob."""
    total_w = float(np.sum(weights))
    if total_w <= 0:
        return 0.0, 0.0, 0.0
    return (
        float(np.sum(weights * top1_vec) / total_w),
        float(np.sum(weights * top3_vec) / total_w),
        float(np.sum(weights * logp_vec) / total_w),
    )


def bootstrap_band_metrics(events, weights, vectors_by_elo, current_elo, n_boot=1000, seed=1503):
    """Compute point estimates, best Elo, and 95% event-cluster bootstrap CIs."""
    unique_events, inv = np.unique(events, return_inverse=True)
    n_events = len(unique_events)
    ev_w = np.bincount(inv, weights=weights, minlength=n_events)
    total_w = float(ev_w.sum())

    rng = np.random.default_rng(seed)
    idx = rng.integers(0, n_events, size=(n_boot, n_events))
    boot_w = ev_w[idx].sum(axis=1)

    ev_logp = {}
    stats = {}
    for elo, (top1_vec, top3_vec, logp_vec) in vectors_by_elo.items():
        ev_t1 = np.bincount(inv, weights=weights * top1_vec, minlength=n_events)
        ev_t3 = np.bincount(inv, weights=weights * top3_vec, minlength=n_events)
        ev_lp = np.bincount(inv, weights=weights * logp_vec, minlength=n_events)
        ev_logp[elo] = ev_lp

        t1_pt = float(ev_t1.sum() / total_w)
        t3_pt = float(ev_t3.sum() / total_w)
        lp_pt = float(ev_lp.sum() / total_w)

        t1_boot = ev_t1[idx].sum(axis=1) / boot_w
        t3_boot = ev_t3[idx].sum(axis=1) / boot_w
        lp_boot = ev_lp[idx].sum(axis=1) / boot_w

        stats[elo] = {
            "top1": (t1_pt, (float(np.percentile(t1_boot, 2.5)), float(np.percentile(t1_boot, 97.5)))),
            "top3": (t3_pt, (float(np.percentile(t3_boot, 2.5)), float(np.percentile(t3_boot, 97.5)))),
            "logp": (lp_pt, (float(np.percentile(lp_boot, 2.5)), float(np.percentile(lp_boot, 97.5)))),
        }

    best_elo = max(
        vectors_by_elo.keys(),
        key=lambda e: (stats[e]["logp"][0], stats[e]["top1"][0]),
    )
    diff_pt = stats[best_elo]["logp"][0] - stats[current_elo]["logp"][0]
    diff_boot = (ev_logp[best_elo][idx].sum(axis=1) - ev_logp[current_elo][idx].sum(axis=1)) / boot_w
    diff_ci = (float(np.percentile(diff_boot, 2.5)), float(np.percentile(diff_boot, 97.5)))
    return stats, best_elo, (diff_pt, diff_ci)


def build_recommendation(band_summaries, elo_mode="mapped"):
    """Generate a data-driven recommendation comparing best move-match Elos to current mapping."""
    lines = ["## Recommendation", ""]
    if elo_mode == "fide":
        reference = f"the raw FIDE rating (`{' / '.join(str(band) for band in BANDS)}`)"
        current_kind = "the band's own FIDE rating"
    else:
        reference = "the current classical mapping (`2300 / 2500 / 2700 / 2900 / 2900`)"
        current_kind = "the current value-calibrated model rating"
    sig_better = [
        row for row in band_summaries
        if row["best_elo"] != row["current_elo"]
        and row["diff_ci"][0] > 0.0
        and row["diff_pt"] >= MIN_PRACTICAL_LOGP_GAIN
    ]
    any_diff = [row for row in band_summaries if row["best_elo"] != row["current_elo"]]

    if not any_diff:
        lines.append(
            f"Keep {reference} for move prediction: every FIDE band already achieves its "
            f"highest held-out mean log-probability at {current_kind}."
        )
    elif not sig_better:
        mapping_str = " / ".join(str(row["best_elo"]) for row in band_summaries)
        lines.append(
            f"Keep {reference} for move prediction. Although point estimates peak at `{mapping_str}`, no band gains at least "
            f"{MIN_PRACTICAL_LOGP_GAIN} nats of mean log-probability with a 95% event-cluster "
            f"bootstrap CI above 0, so a separate mapping is not worth its complexity:"
        )
        lines.append("")
        for row in band_summaries:
            diff_str = calibrate_combined.fmt_ci(row["diff_pt"], row["diff_ci"], "+.4f")
            lines.append(
                f"- Band {row['band']}: best `{row['best_elo']}` vs current `{row['current_elo']}` "
                f"(Δ log-prob {diff_str})"
            )
    else:
        mapping_str = " / ".join(str(row["best_elo"]) for row in band_summaries)
        lines.append(
            f"Use a separate move-match mapping (`{mapping_str}`) instead of {reference} "
            f"when predicting human moves:"
        )
        lines.append("")
        for row in band_summaries:
            diff_str = calibrate_combined.fmt_ci(row["diff_pt"], row["diff_ci"], "+.4f")
            status = (
                "matches current"
                if row["best_elo"] == row["current_elo"]
                else (
                    "relevant gain" if row in sig_better
                    else "detectable but below the practical threshold" if row["diff_ci"][0] > 0.0
                    else "not significant"
                )
            )
            lines.append(
                f"- Band {row['band']}: best `{row['best_elo']}` vs current `{row['current_elo']}` "
                f"(Δ log-prob {diff_str}, {status})"
            )
    lines.append("")
    return lines


def write_report(
    out_path,
    args,
    date,
    test_elos,
    eligible,
    split_meta,
    band_summaries,
    phase_rows,
    timings,
    maia_unique,
    maia_rate,
):
    """Write the markdown move-match evaluation report."""
    lines = [
        "# Maia-3 classical move-match evaluation",
        "",
        f"Run on {date} UTC using {args.pgn.name} and {args.model.name}.",
        f"Seed {args.seed}, requested {args.per_band:,} games per band, "
        f"{args.bootstrap:,} event-cluster bootstrap resamples.",
        "",
        "Held-out games are identical to `calibrate_combined.py` (tournament split on `Event` + year, "
        "~20% held-out per band, grid plies 16, 26, 36, ... up to 3 per game, weighted by "
        "`eligible grid plies / selected`).",
        "Move probabilities are masked to legal moves, renormalised via softmax, and clipped at "
        "`1e-9` for log-probability.",
        "",
        "## Held-out sample sizes",
        "",
    ]
    calibrate.table(lines, ("Band", "Eligible games", "Held games", "Held events", "Held positions", "Unusable PGNs"))
    for band, meta in zip(BANDS, split_meta, strict=True):
        lines.append(
            f"| {band} | {eligible[band]:,} | {meta['held_games']:,} | "
            f"{meta['held_events']:,} | {meta['held_pos']:,} | {meta['held_skipped'].get('unusable PGN', 0)} |"
        )

    lines.extend([
        "",
        "## Best model rating vs current mapping (95% event-bootstrap CI)",
        "",
    ])
    calibrate.table(
        lines,
        (
            "Band",
            "Current Elo",
            "Current log-prob",
            "Current top-1",
            "Best Elo",
            "Best log-prob",
            "Best top-1",
            "Best − Current log-prob (95% CI)",
        ),
    )
    for row in band_summaries:
        c_stats = row["stats"][row["current_elo"]]
        b_stats = row["stats"][row["best_elo"]]
        lines.append(
            f"| {row['band']} | {row['current_elo']} | "
            f"{calibrate_combined.fmt_ci(*c_stats['logp'])} | "
            f"{calibrate_combined.fmt_pct_ci(*c_stats['top1'])} | "
            f"{row['best_elo']} | "
            f"{calibrate_combined.fmt_ci(*b_stats['logp'])} | "
            f"{calibrate_combined.fmt_pct_ci(*b_stats['top1'])} | "
            f"{calibrate_combined.fmt_ci(row['diff_pt'], row['diff_ci'], '+.4f')} |"
        )

    lines.extend([
        "",
        "## Band × model rating metrics (95% event-bootstrap CI)",
        "",
    ])
    calibrate.table(lines, ("Band", "Model Elo", "Top-1 accuracy", "Top-3 accuracy", "Mean log-prob"))
    for row in band_summaries:
        for elo in test_elos:
            s = row["stats"][elo]
            marker = " *" if elo == row["best_elo"] else ""
            lines.append(
                f"| {row['band']} | {elo}{marker} | "
                f"{calibrate_combined.fmt_pct_ci(*s['top1'])} | "
                f"{calibrate_combined.fmt_pct_ci(*s['top3'])} | "
                f"{calibrate_combined.fmt_ci(*s['logp'])} |"
            )

    lines.extend([
        "",
        "*Marked with `*`: best model rating for that band (by mean log-prob, top-1 tie-break).*",
        "",
        "## Breakdown by material phase bucket",
        "",
    ])
    calibrate.table(
        lines,
        (
            "Band",
            "Phase",
            "Positions",
            "Current Elo",
            "Current top-1 / top-3 / log-prob",
            "Best bucket Elo",
            "Best top-1 / top-3 / log-prob",
        ),
    )
    for prow in phase_rows:
        lines.append(
            f"| {prow['band']} | {prow['phase']} | {prow['n']:,} | {prow['current_elo']} | "
            f"{prow['c_top1']:.2%} / {prow['c_top3']:.2%} / {prow['c_logp']:.4f} | "
            f"{prow['best_elo']} | "
            f"{prow['b_top1']:.2%} / {prow['b_top3']:.2%} / {prow['b_logp']:.4f} |"
        )

    lines.append("")
    lines.extend(build_recommendation(band_summaries, args.elo_mode))

    lines.extend([
        "## Runtime",
        "",
        f"- Header pass: {timings['header']:.1f} s",
        f"- Sample parsing: {timings['parse']:.1f} s",
        f"- Maia policy ({timings['workers']} workers, batch={calibrate.BATCH}, "
        f"{maia_unique:,} unique pairs, {maia_rate:.1f} pos/s): {timings['maia']:.1f} s",
        f"- Metrics & bootstrap: {timings['metrics']:.1f} s",
        f"- Total: {timings['total']:.1f} s",
        "",
        "## Reproduction",
        "",
        "```sh",
        shlex.join([sys.executable, *sys.argv]),
        "```",
        "",
    ])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    started = monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgn", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR, type=Path)
    parser.add_argument("--seed", default=1503, type=int)
    parser.add_argument("--per-band", default=20000, type=int)
    parser.add_argument("--test-elos", type=parse_test_elos, default=None)
    parser.add_argument("--elo-mode", choices=("mapped", "fide"), default="mapped")
    parser.add_argument("--bootstrap", default=1000, type=int)
    parser.add_argument(
        "--out-report",
        default=ROOT / "scripts/maia/move-match-report.md",
        type=Path,
    )
    args = parser.parse_args()
    if args.test_elos is None:
        args.test_elos = parse_test_elos(
            DEFAULT_TEST_ELOS if args.elo_mode == "mapped" else FIDE_TEST_ELOS
        )
    if args.per_band < 2:
        parser.error("--per-band must be at least 2")
    if args.bootstrap < 1:
        parser.error("--bootstrap must be at least 1")

    calibrate.verify_encoder()
    calibrate.verify_phase()
    verify_policy_decoding()
    classical = calibrate_combined.load_classical_calibration()
    date = datetime.now(timezone.utc).date().isoformat()

    header_started = monotonic()
    eligible, sampled = calibrate_combined.sample_games_with_events(
        args.pgn, args.per_band, args.seed
    )
    header_seconds = monotonic() - header_started
    print(
        f"Header pass: {header_seconds:.1f} s. Eligible games: {dict(sorted(eligible.items()))}",
        flush=True,
    )

    parse_started = monotonic()
    rng = random.Random(args.seed)
    held_by_band = []
    split_meta = []
    with args.pgn.open(encoding="utf-8-sig", errors="replace") as stream:
        for band in BANDS:
            fit_items, held_items, n_fit_ev, n_held_ev = calibrate_combined.split_by_event(
                sampled[band], rng
            )
            # Parse fit_items first so rng advances identically to calibrate_combined.py.
            calibrate_combined.parse_combined_samples(stream, fit_items, rng)
            held_samples, held_skipped = calibrate_combined.parse_combined_samples(
                stream, held_items, rng
            )
            held_by_band.append(held_samples)
            split_meta.append({
                "held_games": len(held_items),
                "held_events": n_held_ev,
                "held_pos": len(held_samples),
                "held_skipped": held_skipped,
            })
            print(
                f"Band {band}: held {len(held_items):,} games "
                f"({n_held_ev:,} events, {len(held_samples):,} pos)",
                flush=True,
            )
    parse_seconds = monotonic() - parse_started

    cache_name = (
        "maia_policy_cache.jsonl"
        if args.model.name == "maia3-5m.onnx"
        else f"maia_policy_cache_{args.model.stem}.jsonl"
    )
    maia_started = monotonic()
    with calibrate.Inference(args.model) as session:
        maia_workers = session.workers
        policy_cache, maia_unique, maia_rate = evaluate_policy_cached(
            session,
            held_by_band,
            args.test_elos,
            args.cache_dir / cache_name,
        )
    maia_seconds = monotonic() - maia_started

    metrics_started = monotonic()
    band_summaries = []
    phase_rows = []
    for band, held_samples in zip(BANDS, held_by_band, strict=True):
        current_elo = band if args.elo_mode == "fide" else classical[band][0]
        if current_elo not in args.test_elos:
            raise ValueError(
                f"Target {args.elo_mode} Elo {current_elo} for band {band} "
                f"must be included in --test-elos"
            )
        weights = np.array([s.weight for s in held_samples], dtype=np.float64)
        phases = np.array([s.phase for s in held_samples], dtype=np.float64)
        events = np.array([s.event_key for s in held_samples])

        vectors_by_elo = {}
        for elo in args.test_elos:
            top1_vec = np.empty(len(held_samples), dtype=np.float64)
            top3_vec = np.empty(len(held_samples), dtype=np.float64)
            logp_vec = np.empty(len(held_samples), dtype=np.float64)
            for idx_s, s in enumerate(held_samples):
                p_played, top3 = policy_cache[(s.token_hash, s.played_uci, elo)]
                top1_vec[idx_s] = 1.0 if top3 and s.played_uci == top3[0] else 0.0
                top3_vec[idx_s] = 1.0 if s.played_uci in top3 else 0.0
                logp_vec[idx_s] = np.log(max(p_played, LOG_PROB_CLIP))
            vectors_by_elo[elo] = (top1_vec, top3_vec, logp_vec)

        stats, best_elo, (diff_pt, diff_ci) = bootstrap_band_metrics(
            events,
            weights,
            vectors_by_elo,
            current_elo,
            n_boot=args.bootstrap,
            seed=args.seed,
        )
        band_summaries.append({
            "band": band,
            "current_elo": current_elo,
            "best_elo": best_elo,
            "diff_pt": diff_pt,
            "diff_ci": diff_ci,
            "stats": stats,
        })
        print(
            f"Band {band}: current={current_elo} (top1={stats[current_elo]['top1'][0]:.2%}, "
            f"logp={stats[current_elo]['logp'][0]:.4f}) | "
            f"best={best_elo} (top1={stats[best_elo]['top1'][0]:.2%}, "
            f"logp={stats[best_elo]['logp'][0]:.4f}, "
            f"diff={calibrate_combined.fmt_ci(diff_pt, diff_ci, '+.4f')})",
            flush=True,
        )

        for label, mask_fn in PHASE_BUCKETS:
            mask = mask_fn(phases)
            n_bucket = int(np.sum(mask))
            if n_bucket == 0:
                phase_rows.append({
                    "band": band,
                    "phase": label,
                    "n": 0,
                    "current_elo": current_elo,
                    "c_top1": 0.0,
                    "c_top3": 0.0,
                    "c_logp": 0.0,
                    "best_elo": current_elo,
                    "b_top1": 0.0,
                    "b_top3": 0.0,
                    "b_logp": 0.0,
                })
                continue
            bucket_metrics = {
                elo: weighted_metrics(
                    vectors_by_elo[elo][0][mask],
                    vectors_by_elo[elo][1][mask],
                    vectors_by_elo[elo][2][mask],
                    weights[mask],
                )
                for elo in args.test_elos
            }
            bucket_best = max(
                args.test_elos,
                key=lambda e: (bucket_metrics[e][2], bucket_metrics[e][0]),
            )
            c_t1, c_t3, c_lp = bucket_metrics[current_elo]
            b_t1, b_t3, b_lp = bucket_metrics[bucket_best]
            phase_rows.append({
                "band": band,
                "phase": label,
                "n": n_bucket,
                "current_elo": current_elo,
                "c_top1": c_t1,
                "c_top3": c_t3,
                "c_logp": c_lp,
                "best_elo": bucket_best,
                "b_top1": b_t1,
                "b_top3": b_t3,
                "b_logp": b_lp,
            })

    metrics_seconds = monotonic() - metrics_started
    total_seconds = monotonic() - started
    timings = {
        "header": header_seconds,
        "parse": parse_seconds,
        "maia": maia_seconds,
        "metrics": metrics_seconds,
        "total": total_seconds,
        "workers": maia_workers,
    }
    write_report(
        args.out_report,
        args,
        date,
        args.test_elos,
        eligible,
        split_meta,
        band_summaries,
        phase_rows,
        timings,
        maia_unique,
        maia_rate,
    )
    print(f"Wrote report to {args.out_report} in {total_seconds:.1f} s", flush=True)


if __name__ == "__main__":
    main()
