"""Fit the Studio Maia-3 rating and draw calibration from an OTB PGN."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import random
import re
import shlex
import sys
from threading import local
from time import monotonic

import chess
import chess.pgn
import numpy as np
import onnxruntime as ort


ROOT = Path(__file__).resolve().parents[2]
BANDS = (1800, 2000, 2200, 2400, 2600)
RATINGS = tuple(range(1500, 3001, 100))
RESULTS = {b"1-0": 0, b"1/2-1/2": 1, b"0-1": 2}
TAG = re.compile(rb'^\[\s*(\w+)\s+"(.*)"\s*\]\s*$')
FAST_EVENT = re.compile(rb"blitz|rapid|bullet|armageddon|blind|simul", re.IGNORECASE)
TAGS = {b"Event", b"Date", b"Result", b"WhiteElo", b"BlackElo", b"TimeControl"}
HISTORY = 8
WIDTH = HISTORY * 12 + 1
BATCH = 128


def rating_band(tags):
    if tags.get(b"Result") not in RESULTS:
        return None
    if FAST_EVENT.search(tags.get(b"Event", b"")):
        return None
    if tags.get(b"TimeControl", b"").strip().lower() in (b"rapid", b"blitz"):
        return None
    year = tags.get(b"Date", b"").split(b".", 1)[0]
    white, black = (tags.get(key, b"") for key in (b"WhiteElo", b"BlackElo"))
    if not (len(year) == 4 and year.isdigit() and white.isdigit() and black.isdigit()):
        return None
    white, black = int(white), int(black)
    mean = (white + black) // 2
    if int(year) < 2010 or abs(white - black) > 150 or mean < 1700:
        return None
    return min(2600, 1800 + (mean - 1700) // 200 * 200)


def headers(path):
    """Yield the byte offset and selected tags of each header block."""
    offset = 0
    start = None
    tags = {}
    with path.open("rb", buffering=1024 * 1024) as stream:
        for line in stream:
            candidate = line.removeprefix(b"\xef\xbb\xbf") if offset == 0 else line
            match = TAG.match(candidate) if candidate.startswith(b"[") else None
            if match:
                if start is None:
                    start = offset
                key, value = match.groups()
                if key in TAGS:
                    tags[key] = value
            elif start is not None and candidate.strip():
                yield start, tags
                start, tags = None, {}
            offset += len(line)
    if start is not None:
        yield start, tags


def sample_games(path, limit, seed):
    rng = random.Random(seed)
    eligible = Counter()
    sampled = {band: [] for band in BANDS}
    for offset, tags in headers(path):
        band = rating_band(tags)
        if band is None:
            continue
        eligible[band] += 1
        reservoir = sampled[band]
        if len(reservoir) < limit:
            reservoir.append(offset)
        else:
            index = rng.randrange(eligible[band])
            if index < limit:
                reservoir[index] = offset
    return eligible, sampled


def board_channels(board):
    channels = np.zeros((64, 12), dtype=np.uint8)
    mirror = 0 if board.turn == chess.WHITE else 56
    for square, piece in board.piece_map().items():
        channel = piece.piece_type - 1 + (0 if piece.color == board.turn else 6)
        channels[square ^ mirror, channel] = 1
    return channels


def encode_history(history):
    tokens = np.zeros((64, WIDTH), dtype=np.uint8)
    history = history[-HISTORY:]
    padded = [history[0]] * (HISTORY - len(history)) + history
    tokens[:, :HISTORY * 12] = np.concatenate(padded, axis=1)
    return tokens


def move_index(move, turn):
    if move.promotion:
        source = chess.square_file(move.from_square)
        target = chess.square_file(move.to_square)
        promotion = (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT).index(move.promotion)
        return 4096 + (source * 8 + target) * 4 + promotion
    mirror = 0 if turn == chess.WHITE else 56
    return (move.from_square ^ mirror) * 64 + (move.to_square ^ mirror)


def verify_encoder():
    path = ROOT / "src/engine/maia/fixtures/encoder.json"
    fixtures = json.loads(path.read_text())
    for fixture in fixtures:
        boards = [chess.Board(fen) for fen in fixture["fens"]]
        tokens = encode_history([board_channels(board) for board in boards])
        digest = hashlib.sha256(tokens.astype("<f4").tobytes()).hexdigest()
        board = boards[-1]
        indices = sorted(move_index(move, board.turn) for move in board.legal_moves)
        if digest != fixture["tokenHash"] or indices != fixture["legalIndices"]:
            raise ValueError(f"Encoder mismatch for {fixture['name']}")
    print(f"Encoder verified against {len(fixtures)} fixtures", flush=True)


class MainlineBuilder(chess.pgn.GameBuilder):
    def begin_variation(self):
        return chess.pgn.SKIP

    def end_variation(self):
        # python-chess still calls this when it finishes skipping a variation.
        # No variation was pushed by begin_variation, so leave its stack alone.
        pass

    def visit_comment(self, comment):
        pass

    def handle_error(self, error):
        self.game.errors.append(error)


@dataclass
class MoveSample:
    tokens: np.ndarray
    legal: list[int]
    played: int


@dataclass
class ValueSample:
    tokens: np.ndarray
    turn: chess.Color
    outcome: int
    ply: int


@dataclass
class Split:
    moves: list[MoveSample]
    values: list[ValueSample]
    skipped: Counter


def parse_samples(stream, offsets, rng):
    split = Split([], [], Counter())
    for offset in sorted(offsets):
        stream.seek(offset)
        game = chess.pgn.read_game(stream, Visitor=MainlineBuilder)
        if game is None or game.errors:
            split.skipped["unusable PGN"] += 1
            continue
        board = game.board()
        outcome = RESULTS.get(game.headers.get("Result", "").encode())
        moves = list(game.mainline_moves())
        if outcome is None or board.uci_variant != "chess" or board.chess960 or any(not move for move in moves):
            split.skipped["unusable PGN"] += 1
            continue
        last_ply = len(moves)
        if last_ply <= 10:
            split.skipped["no move sample"] += 1
            split.skipped["no value sample"] += 1
            continue
        move_plies = set(rng.sample(range(10, last_ply), min(3, last_ply - 10)))
        value_ply = rng.randrange(16, last_ply) if last_ply > 16 else None
        if value_ply is None:
            split.skipped["no value sample"] += 1
        selected = move_plies | ({value_ply} if value_ply is not None else set())
        needed = {ply - back for ply in selected for back in range(HISTORY)}
        channels = {}
        for ply in range(max(selected) + 1):
            if ply in needed:
                channels[ply] = board_channels(board)
            if ply in selected:
                tokens = encode_history([channels[i] for i in range(ply - HISTORY + 1, ply + 1)])
                if ply in move_plies:
                    legal = sorted(move_index(move, board.turn) for move in board.legal_moves)
                    played = legal.index(move_index(moves[ply], board.turn))
                    split.moves.append(MoveSample(tokens, legal, played))
                if ply == value_ply:
                    split.values.append(ValueSample(tokens, board.turn, outcome, ply))
            board.push(moves[ply])
    if not split.moves or not split.values:
        raise ValueError("A split has no usable move or value samples")
    return split


def batches(samples):
    for start in range(0, len(samples), BATCH):
        yield samples[start:start + BATCH]


class Inference:
    def __init__(self, model):
        cpu_count = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else os.cpu_count()
        self.workers = min(8, cpu_count or 1)
        self.pool = ThreadPoolExecutor(max_workers=self.workers)
        self.model = str(model)
        self.local = local()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.pool.shutdown()

    def predict(self, samples, elo, output):
        def run(batch):
            if not hasattr(self.local, "session"):
                options = ort.SessionOptions()
                options.intra_op_num_threads = 1
                self.local.session = ort.InferenceSession(
                    self.model, options, providers=["CPUExecutionProvider"]
                )
            rating = np.full(len(batch), elo, dtype=np.int64)
            tokens = np.stack([sample.tokens for sample in batch]).astype(np.float32)
            logits = self.local.session.run(
                [output], {"tokens": tokens, "self_elo": rating, "oppo_elo": rating}
            )[0]
            return batch, logits

        return self.pool.map(run, batches(samples))


def log_softmax(logits):
    shifted = logits.astype(np.float64) - np.max(logits, axis=-1, keepdims=True)
    return shifted - np.log(np.exp(shifted).sum(axis=-1, keepdims=True))


def move_metrics(session, samples, elo):
    likelihood = 0.0
    matches = 0
    for batch, predictions in session.predict(samples, elo, "move_logits"):
        for logits, sample in zip(predictions, batch, strict=True):
            legal_logits = logits[sample.legal]
            likelihood += log_softmax(legal_logits)[sample.played]
            matches += int(legal_logits.argmax() == sample.played)
    return likelihood / len(samples), matches / len(samples)


def monotone_ratings(raw):
    """Equal-weight pool-adjacent-violators followed by nearest grid rounding."""
    pools = []
    for rating in raw:
        pools.append((rating, 1))
        while len(pools) > 1:
            left, right = pools[-2:]
            if left[0] * right[1] <= right[0] * left[1]:
                break
            pools[-2:] = [(left[0] + right[0], left[1] + right[1])]
    return [
        min(RATINGS, key=lambda rating: abs(rating * count - total))
        for total, count in pools
        for _ in range(count)
    ]


def value_predictions(session, samples, elo):
    predictions = []
    for batch, logits in session.predict(samples, elo, "value_logits"):
        probabilities = np.exp(log_softmax(logits[:, :3]))
        for sample, row in zip(batch, probabilities, strict=True):
            predictions.append(row[::-1] if sample.turn == chess.WHITE else row)
    return np.array(predictions)


def calibrate_draw(probabilities, factor):
    adjusted = probabilities.copy()
    adjusted[:, 1] *= factor
    return adjusted / adjusted.sum(axis=1, keepdims=True)


def fit_draw_factor(probabilities, outcomes):
    # The log-loss derivative in log(k) is mean calibrated draw minus observed draw.
    observed = np.mean(outcomes == 1)
    low, high = 0.0, 1.0
    if probabilities[:, 1].mean() >= observed:
        return 1.0
    if observed == 1.0:
        raise ValueError("No finite draw factor for an all-draw fit split")
    while calibrate_draw(probabilities, math.exp(high))[:, 1].mean() < observed:
        high *= 2
    for _ in range(50):
        middle = (low + high) / 2
        if calibrate_draw(probabilities, math.exp(middle))[:, 1].mean() < observed:
            low = middle
        else:
            high = middle
    return round(math.exp((low + high) / 2), 3)


def value_metrics(raw, calibrated, outcomes):
    if not len(outcomes):
        return "0 | — | — | — | — | —", None
    observed = np.mean(outcomes == 1)
    unadjusted, adjusted = (p[:, 1].mean() for p in (raw, calibrated))
    losses = [-np.log(p[np.arange(len(outcomes)), outcomes]).mean() for p in (raw, calibrated)]
    row = (f"{len(outcomes)} | {observed:.2%} | {unadjusted:.2%} | {adjusted:.2%}"
           f" | {losses[0]:.4f} | {losses[1]:.4f}")
    return row, abs(adjusted - observed) <= 0.03


def table(lines, columns):
    lines.append("| " + " | ".join(columns) + " |")
    lines.append("| " + " | ".join("---" for _ in columns) + " |")


def evaluate(session, band, rating, fit, held):
    raw_fit = value_predictions(session, fit.values, rating)
    factor = fit_draw_factor(raw_fit, np.array([sample.outcome for sample in fit.values]))
    raw = value_predictions(session, held.values, rating)
    calibrated = calibrate_draw(raw, factor)
    outcomes = np.array([sample.outcome for sample in held.values])
    plies = np.array([sample.ply for sample in held.values])
    overall, within = value_metrics(raw, calibrated, outcomes)
    buckets = []
    for label, mask in (("16–40", plies <= 40), ("41–80", (plies > 40) & (plies <= 80)),
                        ("81+", plies > 80)):
        row, _ = value_metrics(raw[mask], calibrated[mask], outcomes[mask])
        buckets.append(f"| {band} | {label} | {row} |")

    mapped_ll, mapped_top = move_metrics(session, held.moves, rating)
    base_ll, base_top = (mapped_ll, mapped_top) if band == rating else move_metrics(
        session, held.moves, band
    )
    return (
        factor, f"| {band} | {overall} | {'Yes' if within else 'No'} |", buckets,
        f"| {band} | {len(held.moves)} | {base_top:.2%} | {mapped_top:.2%}"
        f" | {base_ll:.4f} | {mapped_ll:.4f} |",
    )


def main():
    started = monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgn", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--seed", default=1503, type=int)
    parser.add_argument("--per-band", default=6000, type=int)
    parser.add_argument("--out-ts", required=True, type=Path)
    parser.add_argument("--out-report", required=True, type=Path)
    args = parser.parse_args()
    if args.per_band < 2:
        parser.error("--per-band must be at least 2")

    logging.basicConfig(level=logging.WARNING)
    verify_encoder()
    date = datetime.now(timezone.utc).date().isoformat()
    header_started = monotonic()
    eligible, sampled = sample_games(args.pgn, args.per_band, args.seed)
    header_seconds = monotonic() - header_started
    print(f"Header pass: {header_seconds:.1f} s. Eligible games: {dict(sorted(eligible.items()))}",
          flush=True)

    samples = []
    grids = []
    counts = []
    rng = random.Random(args.seed)
    parse_started = monotonic()
    with args.pgn.open(encoding="utf-8-sig", errors="replace") as stream:
        for band in BANDS:
            offsets = sorted(sampled[band])
            if len(offsets) < 2:
                raise ValueError(f"Band {band} needs at least two eligible games")
            rng.shuffle(offsets)
            held_count = max(1, len(offsets) // 5)
            fit_offsets, held_offsets = offsets[held_count:], offsets[:held_count]
            fit = parse_samples(stream, fit_offsets, rng)
            held = parse_samples(stream, held_offsets, rng)
            samples.append((fit, held))
            counts.append((len(fit_offsets), len(held_offsets)))
            print(f"Band {band}: {len(fit.moves)} fit moves, {len(held.moves)} held-out moves",
                  flush=True)
    parse_seconds = monotonic() - parse_started

    with Inference(args.model) as session:
        sweep_started = monotonic()
        for band, (fit, _) in zip(BANDS, samples, strict=True):
            grid = []
            for elo in RATINGS:
                grid.append(move_metrics(session, fit.moves, elo))
                print(f"Band {band}, rating {elo}: log likelihood {grid[-1][0]:.5f}", flush=True)
            grids.append(grid)
        sweep_seconds = monotonic() - sweep_started

        raw = [RATINGS[max(range(len(grid)), key=lambda i: grid[i][0])] for grid in grids]
        ratings = monotone_ratings(raw)
        print(f"Raw ratings: {raw}. Monotone ratings: {ratings}", flush=True)
        evaluations = []
        for band, rating, splits in zip(BANDS, ratings, samples, strict=True):
            evaluations.append(evaluate(session, band, rating, *splits))
            print(f"Band {band}: draw factor {evaluations[-1][0]:.3f}", flush=True)

    source = f"{args.pgn.name} and CSSLab {args.model.name}"
    ts = [
        "// Generated by scripts/maia/calibrate.py.",
        f"// Source: {source}",
        f"// Date (UTC): {date}. Seed: {args.seed}.",
        "// Sampled games by band (fit / held-out): " + ", ".join(
            f"{band}: {fit} / {held}" for band, (fit, held) in zip(BANDS, counts, strict=True)
        ),
        "export const MAIA_CLASSICAL_CALIBRATION = [",
    ]
    for band, rating, (factor, *_) in zip(BANDS, ratings, evaluations, strict=True):
        ts.append(f"  {{ elo: {band}, modelElo: {rating}, drawFactor: {factor:.3f} }},")
    ts.append("] as const;")

    report = [
        "# Maia-3 classical calibration", "",
        f"Run on {date} UTC using {source}.",
        f"Seed {args.seed}, requested {args.per_band:,} games per band.", "",
        "The header scan admits games with missing TimeControl if they pass the other filters. "
        "Some fast games may therefore remain in the sample. The 2600 band starts at mean Elo 2500.",
        "Ply counts half-moves played before the sampled position. Fit and held-out samples "
        "come from disjoint games. Move metrics use up to three uniformly sampled positions "
        "per game, with ply ≥ 10. Value metrics use one uniformly sampled position per game "
        "with ply ≥ 16. Both stop before the terminal position.", "",
        "## Sample sizes", "",
    ]
    table(report, ("Band", "Eligible games", "Games fit / held", "Move positions fit / held",
                   "Value positions fit / held", "Unusable PGNs fit / held"))
    for band, (fit_n, held_n), (fit, held) in zip(BANDS, counts, samples, strict=True):
        report.append(f"| {band} | {eligible[band]:,} | {fit_n:,} / {held_n:,} "
                      f"| {len(fit.moves):,} / {len(held.moves):,} "
                      f"| {len(fit.values):,} / {len(held.values):,} "
                      f"| {fit.skipped['unusable PGN']} / {held.skipped['unusable PGN']} |")

    report.extend(["", "## Rating and draw-factor fit", ""])
    if ratings == raw:
        report.append("The raw likelihood maxima were already monotone.")
    else:
        report.append("Equal-weight isotonic regression minimised squared changes to the raw "
                      "rating maxima. Pooled ratings were rounded to the nearest 100-point "
                      "grid value, with ties rounded down.")
    report.extend([
        "Draw factors minimise fit multinomial log loss subject to k ≥ 1. "
        "Held-out evaluation uses the factors rounded to three decimals.", "",
    ])
    table(report, ("Band", "Raw best Elo", "Model Elo", "Draw factor"))
    for band, best, rating, evaluation in zip(BANDS, raw, ratings, evaluations, strict=True):
        report.append(f"| {band} | {best} | {rating} | {evaluation[0]:.3f} |")
    report.extend(["", "Fit legal-move mean log likelihood / top-1 accuracy by rating.", ""])
    table(report, ("Model input", *(str(band) for band in BANDS)))
    for i, elo in enumerate(RATINGS):
        report.append(f"| {elo} | " + " | ".join(
            f"{grid[i][0]:.4f} / {grid[i][1]:.2%}" for grid in grids
        ) + " |")

    report.extend([
        "", "## Held-out value head", "",
        "Raw and calibrated predictions both use the fitted model Elo. Draw rates average "
        "the predicted draw probability across positions. Log loss uses natural logarithms.", "",
    ])
    metrics = ("Games", "Observed draw", "Raw draw", "Calibrated draw", "Raw loss", "Calibrated loss")
    table(report, ("Band", *metrics, "Within 3 pp?"))
    report.extend(evaluation[1] for evaluation in evaluations)
    report.extend(["", "### By ply", ""])
    table(report, ("Band", "Ply", *metrics))
    for evaluation in evaluations:
        report.extend(evaluation[2])

    report.extend(["", "## Held-out move head", ""])
    table(report, ("Band", "Positions", "Top-1 at band Elo", "Top-1 at model Elo",
                   "Mean log likelihood at band Elo", "Mean log likelihood at model Elo"))
    report.extend(evaluation[3] for evaluation in evaluations)
    report.extend([
        "", "## Reproduction", "", "```sh",
        'maia_tmp="$(mktemp -d)"',
        'python3 -m venv "$maia_tmp/venv"',
        f'"$maia_tmp/venv/bin/pip" install onnxruntime=={ort.__version__} '
        f'python-chess==1.999 numpy=={np.__version__}',
        '"$maia_tmp/venv/bin/python" ' + shlex.join(sys.argv),
        "```", "",
        f"CPU execution provider, {session.workers} single-threaded inference workers, "
        f"batch size {BATCH}. Header pass {header_seconds:.1f} s, "
        f"sample parsing {parse_seconds:.1f} s, rating sweep {sweep_seconds:.1f} s, "
        f"total {monotonic() - started:.1f} s.",
    ])
    for path, lines in ((args.out_ts, ts), (args.out_report, report)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
