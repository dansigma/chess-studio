"""Fit the Studio Maia-3 rating and draw calibration from an OTB PGN."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
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
DEFAULT_MODEL_ELOS = "2300,2500,2700,2900,2900"
MATERIAL = {chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
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


def material_phase(board):
    return sum(
        weight * chess.popcount(board.pieces_mask(piece, color))
        for piece, weight in MATERIAL.items()
        for color in chess.COLORS
    ) / 62


def verify_phase():
    path = ROOT / "src/engine/maia/fixtures/phase.json"
    for fixture in json.loads(path.read_text()):
        fen = fixture["fen"]
        if material_phase(chess.Board(fen)) != fixture["material"] / 62:
            raise ValueError(f"Material phase mismatch for {fen}")


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
    phase: float


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
        value_plies = set(range(16, last_ply, 10))
        if value_plies:
            # Preserve the original RNG stream for move positions and game splits.
            rng.randrange(16, last_ply)
        else:
            split.skipped["no value sample"] += 1
        selected = move_plies | value_plies
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
                if ply in value_plies:
                    split.values.append(ValueSample(tokens, board.turn, outcome, ply, material_phase(board)))
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


def fit_draw(probabilities, outcomes, design):
    # Scaling only the draw probability changes the multinomial loss by the
    # same amount as logistic loss on the draw indicator with fixed raw log odds.
    draw = outcomes == 1
    log_odds = np.log(probabilities[:, 1]) - np.log(probabilities[:, [0, 2]].sum(axis=1))
    params = np.zeros(design.shape[1])

    def loss(logits):
        return np.logaddexp(0, np.where(draw, -logits, logits)).sum()

    for _ in range(100):
        logits = log_odds + design @ params
        predicted = np.exp(-np.logaddexp(0, -logits))
        gradient = design.T @ (predicted - draw)
        weights = np.exp(-np.logaddexp(0, logits) - np.logaddexp(0, -logits))
        hessian = design.T @ (weights[:, None] * design)
        step, *_ = np.linalg.lstsq(hessian, gradient, rcond=None)
        if np.max(np.abs(step)) < 1e-8:
            return params
        current_loss = loss(logits)
        while loss(log_odds + design @ (params - step)) > current_loss:
            step /= 2
        params -= step
    raise ValueError("Draw calibration did not converge")


def value_metrics(raw, calibrated, constant, outcomes, threshold):
    if not len(outcomes):
        return "0" + " | —" * 9
    observed = np.mean(outcomes == 1)
    predictions = (raw, calibrated, constant)
    rates = [p[:, 1].mean() for p in predictions]
    losses = [-np.log(p[np.arange(len(outcomes)), outcomes]).mean() for p in predictions]
    checks = ["Yes" if abs(rate - observed) <= threshold else "No" for rate in rates[1:]]
    return " | ".join([
        f"{len(outcomes):,}", f"{observed:.2%}", *(f"{rate:.2%}" for rate in rates),
        *(f"{loss:.4f}" for loss in losses), *checks,
    ])


def table(lines, columns):
    lines.append("| " + " | ".join(columns) + " |")
    lines.append("| " + " | ".join("---" for _ in columns) + " |")


def evaluate_value(session, band, rating, fit, held):
    raw_fit = value_predictions(session, fit, rating)
    fit_phase = np.array([sample.phase for sample in fit])
    fit_outcomes = np.array([sample.outcome for sample in fit])
    intercept = np.ones((len(fit), 1))
    bias, slope = np.round(fit_draw(raw_fit, fit_outcomes, np.column_stack((intercept, fit_phase))), 3)
    factor = round(float(np.exp(fit_draw(raw_fit, fit_outcomes, intercept)[0])), 3)

    raw = value_predictions(session, held, rating)
    phase = np.array([sample.phase for sample in held])
    calibrated = calibrate_draw(raw, np.exp(bias + slope * phase))
    constant = calibrate_draw(raw, factor)
    outcomes = np.array([sample.outcome for sample in held])
    plies = np.array([sample.ply for sample in held])

    def bucket_rows(buckets):
        return [
            f"| {band} | {label} | "
            + value_metrics(raw[mask], calibrated[mask], constant[mask], outcomes[mask], 0.05) + " |"
            for label, mask in buckets
        ]

    overall = f"| {band} | {value_metrics(raw, calibrated, constant, outcomes, 0.03)} |"
    by_phase = bucket_rows((
        ("≥0.75", phase >= 0.75),
        ("0.4–<0.75", (phase >= 0.4) & (phase < 0.75)),
        ("<0.4", phase < 0.4),
    ))
    by_ply = bucket_rows((
        ("16–40", plies <= 40),
        ("41–80", (plies > 40) & (plies <= 80)),
        ("81+", plies > 80),
    ))
    return (bias, slope, factor), overall, by_phase, by_ply


def model_elos(value):
    try:
        ratings = tuple(int(rating) for rating in value.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError("expected comma-separated integer ratings") from None
    if len(ratings) != len(BANDS) or ratings != tuple(sorted(ratings)) or not (
        RATINGS[0] <= ratings[0] <= ratings[-1] <= RATINGS[-1]
    ):
        raise argparse.ArgumentTypeError("expected five non-decreasing ratings from 1500 through 3000")
    return ratings


def rating_metrics(session, samples, args):
    if not args.sweep:
        archive = json.loads(Path(__file__).with_name("rating-sweep.json").read_text())
        if archive["bands"] != list(BANDS):
            raise ValueError("Archived rating sweep bands do not match")
        same_fit = (
            archive["pgn"] == args.pgn.name and archive["model"] == args.model.name
            and archive["seed"] == args.seed and archive["per_band"] == args.per_band
        )
        return {elo: archive["metrics"][str(elo)] for elo in RATINGS}, same_fit

    grid = {}
    for elo in RATINGS:
        grid[elo] = [move_metrics(session, fit.moves, elo) for fit, _ in samples]
        print(f"Sweep: completed model Elo {elo}", flush=True)
    return grid, True


def format_move(metrics):
    likelihood, top = metrics
    return f"{likelihood:.4f} / {top:.2%}"


def main():
    started = monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgn", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--seed", default=1503, type=int)
    parser.add_argument("--per-band", default=6000, type=int)
    parser.add_argument("--model-elos", type=model_elos, default=DEFAULT_MODEL_ELOS)
    parser.add_argument("--sweep", action="store_true", help="recompute fit move metrics across the rating grid")
    parser.add_argument("--out-ts", required=True, type=Path)
    parser.add_argument("--out-report", required=True, type=Path)
    args = parser.parse_args()
    if args.per_band < 2:
        parser.error("--per-band must be at least 2")

    logging.basicConfig(level=logging.WARNING)
    verify_encoder()
    verify_phase()
    date = datetime.now(timezone.utc).date().isoformat()
    header_started = monotonic()
    eligible, sampled = sample_games(args.pgn, args.per_band, args.seed)
    header_seconds = monotonic() - header_started
    print(f"Header pass: {header_seconds:.1f} s. Eligible games: {dict(sorted(eligible.items()))}",
          flush=True)

    samples = []
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
        grid, grid_matches_fit = rating_metrics(session, samples, args)
        sweep_seconds = monotonic() - sweep_started

        evaluations = []
        move_rows = []
        for i, (band, rating, (fit, held)) in enumerate(zip(BANDS, args.model_elos, samples, strict=True)):
            best = max(RATINGS, key=lambda elo: grid[elo][i][0])
            fit_best = grid[best][i] if grid_matches_fit else move_metrics(session, fit.moves, best)
            if rating == best:
                fit_chosen = fit_best
            elif grid_matches_fit and rating in grid:
                fit_chosen = grid[rating][i]
            else:
                fit_chosen = move_metrics(session, fit.moves, rating)
            held_chosen = move_metrics(session, held.moves, rating)
            held_best = held_chosen if best == rating else move_metrics(session, held.moves, best)
            move_rows.append(
                f"| {band} | {rating} | {best} | {len(held.moves):,} | {format_move(fit_chosen)}"
                f" | {format_move(fit_best)} | {format_move(held_chosen)} | {format_move(held_best)} |"
            )
            print(f"Band {band}: move metrics complete; evaluating {len(fit.values):,} fit "
                  f"and {len(held.values):,} held-out value positions", flush=True)
            evaluations.append(evaluate_value(session, band, rating, fit.values, held.values))
            print(f"Band {band}: draw bias, slope, constant factor {evaluations[-1][0]}", flush=True)

    source = f"{args.pgn.name} and CSSLab {args.model.name}"
    ts = [
        "// Generated by scripts/maia/calibrate.py.",
        f"// Source: {source}",
        f"// Date (UTC): {date}. Seed: {args.seed}.",
        "// Sampled games by band (fit / held-out): " + ", ".join(
            f"{band}: {fit} / {held}" for band, (fit, held) in zip(BANDS, counts, strict=True)
        ),
        "// Multiply the draw probability by exp(drawBias + drawSlope * phase) and renormalise.",
        "// See phase.ts for materialPhase(fen).",
        "export const MAIA_CLASSICAL_CALIBRATION = [",
    ]
    for band, rating, ((bias, slope, _), *_) in zip(BANDS, args.model_elos, evaluations, strict=True):
        ts.append(f"  {{ elo: {band}, modelElo: {rating}, drawBias: {bias:.3f}, drawSlope: {slope:.3f} }},")
    ts.append("] as const;")

    report = [
        "# Maia-3 classical calibration", "",
        f"Run on {date} UTC using {source}.",
        f"Seed {args.seed}, requested {args.per_band:,} games per band.", "",
        "The header scan admits games with missing TimeControl if they pass the other filters. "
        "Some fast games may therefore remain in the sample. The 2600 band starts at mean Elo 2500.",
        "Ply counts half-moves played before the sampled position. Fit and held-out samples "
        "come from disjoint games. Move metrics use up to three uniformly sampled positions "
        "per game, with ply ≥ 10. Value metrics use plies 16, 26, 36 and every tenth ply "
        "thereafter. Each game contributes one equally weighted position at each of those "
        "plies it reaches before the terminal position.", "",
        "## Sample sizes", "",
    ]
    table(report, ("Band", "Eligible games", "Games fit / held", "Move positions fit / held",
                   "Value positions fit / held", "Unusable PGNs fit / held"))
    for band, (fit_n, held_n), (fit, held) in zip(BANDS, counts, samples, strict=True):
        report.append(f"| {band} | {eligible[band]:,} | {fit_n:,} / {held_n:,} "
                      f"| {len(fit.moves):,} / {len(held.moves):,} "
                      f"| {len(fit.values):,} / {len(held.values):,} "
                      f"| {fit.skipped['unusable PGN']} / {held.skipped['unusable PGN']} |")

    report.extend([
        "", "## Model Elo mapping", "",
        "The spaced model Elo mapping is a product choice. The raw argmax maximises fit "
        "legal-move mean log likelihood on the 100 Elo grid, reaching 2900 in the top three "
        "bands in the original sweep.",
        ("This run recomputed the fit sweep." if args.sweep else
         "Fit grid metrics come from the original sweep in rating-sweep.json. "
         + ("The game splits and sampled move positions are preserved." if grid_matches_fit else
            "The chosen and archived argmax ratings were re-evaluated on the current fit split.")),
        "Held-out move metrics were recomputed at the chosen input and the fit argmax.",
        "Each metric pair is mean legal-move log likelihood / top-1 accuracy.", "",
    ])
    table(report, ("Band", "Chosen Elo", "Fit argmax Elo", "Held-out moves", "Fit chosen",
                   "Fit argmax", "Held-out chosen", "Held-out argmax"))
    report.extend(move_rows)
    report.extend(["", "Fit legal-move mean log likelihood / top-1 accuracy by rating.", ""])
    table(report, ("Model input", *(str(band) for band in BANDS)))
    for elo in RATINGS:
        report.append(f"| {elo} | " + " | ".join(map(format_move, grid[elo])) + " |")

    report.extend([
        "", "## Draw model fit", "",
        "Phase is both sides’ non-pawn material divided by 62 (N and B = 3, R = 5, Q = 9). "
        "The phase model multiplies the raw draw probability by "
        "`exp(drawBias + drawSlope * phase)` and renormalises all three probabilities. "
        "Both models minimise multinomial log loss on the same fit positions. "
        "Held-out evaluation uses parameters rounded to three decimals.", "",
    ])
    table(report, ("Band", "Draw bias", "Draw slope", "Constant factor"))
    for band, ((bias, slope, factor), *_) in zip(BANDS, evaluations, strict=True):
        report.append(f"| {band} | {bias:.3f} | {slope:.3f} | {factor:.3f} |")

    report.extend([
        "", "## Held-out value head", "",
        "All predictions use the chosen model Elo. Draw rates average predicted draw "
        "probabilities across positions. Log loss uses natural logarithms.", "",
    ])
    metrics = ("Positions", "Observed draw", "Raw draw", "Phase draw", "Constant draw",
               "Raw loss", "Phase loss", "Constant loss")
    for title, column, index in (("", (), 1), ("By phase", ("Phase",), 2), ("By ply", ("Ply",), 3)):
        if title:
            report.extend(["", f"### {title}", ""])
        threshold = 5 if title else 3
        table(report, ("Band", *column, *metrics, f"Phase within {threshold} pp?",
                       f"Constant within {threshold} pp?"))
        for evaluation in evaluations:
            if title:
                report.extend(evaluation[index])
            else:
                report.append(evaluation[index])

    sweep_timing = f"rating sweep {sweep_seconds:.1f} s" if args.sweep else "rating sweep skipped"
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
        f"sample parsing {parse_seconds:.1f} s, {sweep_timing}, total {monotonic() - started:.1f} s.",
    ])
    for path, lines in ((args.out_ts, ts), (args.out_report, report)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
