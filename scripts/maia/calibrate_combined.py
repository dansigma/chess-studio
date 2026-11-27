"""Fit and evaluate a combined Maia-3 + Stockfish classical value calibration."""

import argparse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import queue
import random
import re
import shlex
import subprocess
import sys
from threading import Lock
from time import monotonic

import chess
import chess.pgn
import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent))
import calibrate  # noqa: E402


ROOT = calibrate.ROOT
BANDS = calibrate.BANDS
DEFAULT_MODEL_ELOS = calibrate.DEFAULT_MODEL_ELOS
DEFAULT_STOCKFISH = Path("/home/danilo/data/stockfish/stockfish-19")
DEFAULT_CACHE_DIR = Path("/home/danilo/data/maia/cache")
FEATURE_NAMES = (
    "log(pW) - log(pD)",
    "log(pB) - log(pD)",
    "e = tanh(cp / 400)",
    "e^2",
    "e * phase",
    "phase",
    "1",
)
N_FEATURES = len(FEATURE_NAMES)
SF_INFO_RE = re.compile(
    r"\bdepth (\d+)\b.*\bscore (cp|mate) (-?\d+)(?:\s+(lowerbound|upperbound))?"
)
CLASSICAL_ROW_RE = re.compile(
    r"\{\s*elo:\s*(\d+),\s*modelElo:\s*(\d+),\s*drawBias:\s*(-?[\d.]+),\s*drawSlope:\s*(-?[\d.]+)\s*\}"
)


@dataclass
class CombinedSample:
    tokens: np.ndarray
    turn: chess.Color
    outcome: int
    ply: int
    phase: float
    fen: str
    weight: float
    event_key: str
    token_hash: str


def load_classical_calibration():
    path = ROOT / "src/engine/maia/classical-calibration.ts"
    text = path.read_text(encoding="utf-8")
    rows = {}
    for match in CLASSICAL_ROW_RE.finditer(text):
        elo, model_elo, bias, slope = match.groups()
        rows[int(elo)] = (int(model_elo), float(bias), float(slope))
    if tuple(sorted(rows)) != BANDS:
        raise ValueError(f"Unexpected bands in {path}: {sorted(rows)}")
    return rows


def event_key_from_tags(tags):
    event = tags.get(b"Event", b"").decode("utf-8", errors="replace").strip()
    year = tags.get(b"Date", b"").split(b".", 1)[0].decode("ascii", errors="replace")
    return f"{event} ({year})"


def sample_games_with_events(path, limit, seed):
    rng = random.Random(seed)
    eligible = Counter()
    sampled = {band: [] for band in BANDS}
    for offset, tags in calibrate.headers(path):
        band = calibrate.rating_band(tags)
        if band is None:
            continue
        eligible[band] += 1
        item = (offset, event_key_from_tags(tags))
        reservoir = sampled[band]
        if len(reservoir) < limit:
            reservoir.append(item)
        else:
            index = rng.randrange(eligible[band])
            if index < limit:
                reservoir[index] = item
    return eligible, sampled


def split_by_event(game_items, rng):
    by_event = defaultdict(list)
    for offset, event_key in game_items:
        by_event[event_key].append((offset, event_key))

    event_keys = sorted(by_event.keys())
    if len(event_keys) < 2:
        raise ValueError(f"Need at least 2 distinct events to split, got {len(event_keys)}")
    rng.shuffle(event_keys)

    total_games = len(game_items)
    target_held = max(1, round(0.2 * total_games))
    held_events = set()
    fit_events = set()
    held_items = []
    fit_items = []

    for i, ek in enumerate(event_keys):
        group = by_event[ek]
        remaining_events = len(event_keys) - i - 1
        # Keep at least 1 event for fit; assign to held until we reach ~20%.
        if len(held_items) < target_held and (len(fit_items) > 0 or remaining_events > 0):
            held_events.add(ek)
            held_items.extend(group)
        else:
            fit_events.add(ek)
            fit_items.extend(group)

    if not fit_events.isdisjoint(held_events):
        raise ValueError("Event leakage between fit and held-out splits")
    if not (fit_items and held_items):
        raise ValueError("Both fit and held-out splits must be non-empty")
    return fit_items, held_items, len(fit_events), len(held_events)


def parse_combined_samples(stream, game_items, rng):
    samples = []
    skipped = Counter()
    for offset, event_key in sorted(game_items, key=lambda x: x[0]):
        stream.seek(offset)
        game = chess.pgn.read_game(stream, Visitor=calibrate.MainlineBuilder)
        if game is None or game.errors:
            skipped["unusable PGN"] += 1
            continue
        board = game.board()
        outcome = calibrate.RESULTS.get(game.headers.get("Result", "").encode())
        moves = list(game.mainline_moves())
        if (
            outcome is None
            or board.uci_variant != "chess"
            or board.chess960
            or any(not move for move in moves)
        ):
            skipped["unusable PGN"] += 1
            continue
        last_ply = len(moves)
        grid_plies = list(range(16, last_ply, 10))
        if not grid_plies:
            skipped["no value sample"] += 1
            continue
        selected_plies = sorted(rng.sample(grid_plies, min(3, len(grid_plies))))
        weight = len(grid_plies) / len(selected_plies)
        selected_set = set(selected_plies)
        needed = {ply - back for ply in selected_set for back in range(calibrate.HISTORY)}
        channels = {}
        for ply in range(max(selected_set) + 1):
            if ply in needed:
                channels[ply] = calibrate.board_channels(board)
            if ply in selected_set:
                tokens = calibrate.encode_history(
                    [channels[i] for i in range(ply - calibrate.HISTORY + 1, ply + 1)]
                )
                token_hash = hashlib.sha256(tokens.tobytes()).hexdigest()
                samples.append(
                    CombinedSample(
                        tokens=tokens,
                        turn=board.turn,
                        outcome=outcome,
                        ply=ply,
                        phase=calibrate.material_phase(board),
                        fen=board.fen(),
                        weight=weight,
                        event_key=event_key,
                        token_hash=token_hash,
                    )
                )
            board.push(moves[ply])
    if not samples:
        raise ValueError("A split has no usable value samples")
    return samples, skipped


def load_sf_cache(path):
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
                cache[(rec["fen"], int(rec["depth"]))] = int(rec["cp"])
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
    return cache


def load_maia_cache(path):
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
                cache[(rec["key"], int(rec["elo"]))] = np.array(rec["probs"], dtype=np.float64)
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
    return cache


def format_eta(seconds):
    if seconds < 0 or not np.isfinite(seconds):
        return "?"
    secs = int(round(seconds))
    h, rem = divmod(secs, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h}h{m:02d}m{s:02d}s"
    if m > 0:
        return f"{m}m{s:02d}s"
    return f"{s}s"


class StockfishWorker:
    def __init__(self, binary_path):
        self.proc = subprocess.Popen(
            [str(binary_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self._send("uci")
        self._wait_for("uciok")
        self._send("setoption name Threads value 1")
        self._send("setoption name Hash value 64")
        self._send("isready")
        self._wait_for("readyok")

    def _send(self, cmd):
        assert self.proc.stdin is not None
        self.proc.stdin.write(cmd + "\n")
        self.proc.stdin.flush()

    def _wait_for(self, prefix):
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            if line.startswith(prefix):
                return
        raise RuntimeError(f"Stockfish exited unexpectedly while waiting for {prefix}")

    def evaluate(self, fen, target_depth):
        self._send("ucinewgame")
        self._send("isready")
        self._wait_for("readyok")
        self._send(f"position fen {fen}")
        self._send(f"go depth {target_depth}")

        stm_black = fen.split(" ", 2)[1] == "b"
        exact_scores = {}
        bound_scores = {}
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            if line.startswith("info "):
                match = SF_INFO_RE.search(line)
                if match:
                    d = int(match.group(1))
                    kind = match.group(2)
                    raw = int(match.group(3))
                    bound = match.group(4)
                    if kind == "mate":
                        cp = 1000 if raw > 0 else -1000
                    else:
                        cp = max(-1000, min(1000, raw))
                    if stm_black:
                        cp = -cp
                    if bound is None:
                        exact_scores[d] = cp
                    else:
                        bound_scores[d] = cp
            elif line.startswith("bestmove "):
                break

        merged = {**bound_scores, **exact_scores}
        if not merged:
            raise RuntimeError(f"Stockfish produced no score for FEN: {fen}")

        needed_depths = (12, 16, 20) if target_depth >= 20 else (12, 16)
        out = {}
        available = sorted(merged.keys())
        for d in needed_depths:
            if d in merged:
                out[d] = merged[d]
            else:
                le = [x for x in available if x <= d]
                fallback = le[-1] if le else available[0]
                out[d] = merged[fallback]
        return out

    def close(self):
        try:
            self._send("quit")
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


def evaluate_stockfish(needed_depths, stockfish_bin, cache_path, workers):
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    sf_cache = load_sf_cache(cache_path)

    todo = []
    for fen, target_depth in needed_depths.items():
        req = (12, 16, 20) if target_depth >= 20 else (12, 16)
        if not all((fen, d) in sf_cache for d in req):
            todo.append((fen, target_depth))

    print(
        f"Stockfish cache: {len(needed_depths):,} unique FENs needed, "
        f"{len(needed_depths) - len(todo):,} cached, {len(todo):,} to evaluate",
        flush=True,
    )
    if not todo:
        return sf_cache

    task_q = queue.Queue()
    for item in todo:
        task_q.put(item)

    lock = Lock()
    done = 0
    started = monotonic()
    last_log = started

    with cache_path.open("a", encoding="utf-8") as cache_file:
        def worker_loop():
            nonlocal done, last_log
            engine = StockfishWorker(stockfish_bin)
            try:
                while True:
                    try:
                        fen, target_depth = task_q.get_nowait()
                    except queue.Empty:
                        break
                    scores = engine.evaluate(fen, target_depth)
                    lines = []
                    with lock:
                        for d, cp in scores.items():
                            sf_cache[(fen, d)] = cp
                            lines.append(json.dumps({"fen": fen, "depth": d, "cp": cp}) + "\n")
                        cache_file.writelines(lines)
                        cache_file.flush()
                        done += 1
                        now = monotonic()
                        if done == len(todo) or now - last_log >= 5.0:
                            elapsed = now - started
                            rate = done / elapsed if elapsed > 0 else 0.0
                            eta = (len(todo) - done) / rate if rate > 0 else float("inf")
                            print(
                                f"Stockfish: {done:,}/{len(todo):,} ({done / len(todo):.1%}) "
                                f"| {rate:.2f} pos/s | elapsed {format_eta(elapsed)} "
                                f"| ETA {format_eta(eta)}",
                                flush=True,
                            )
                            last_log = now
                    task_q.task_done()
            finally:
                engine.close()

        n_workers = min(workers, len(todo))
        with ThreadPoolExecutor(max_workers=n_workers) as pool:
            futures = [pool.submit(worker_loop) for _ in range(n_workers)]
            for fut in as_completed(futures):
                fut.result()

    return sf_cache


def evaluate_maia_cached(session, samples_by_band, model_elos, cache_path):
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    maia_cache = load_maia_cache(cache_path)

    todo_by_elo = defaultdict(dict)
    total_needed = 0
    for (fit, held), elo in zip(samples_by_band, model_elos, strict=True):
        for s in (*fit, *held):
            key = (s.token_hash, elo)
            if key not in maia_cache and s.token_hash not in todo_by_elo[elo]:
                todo_by_elo[elo][s.token_hash] = s
                total_needed += 1

    print(f"Maia cache: {total_needed:,} unique (position, modelElo) pairs to evaluate", flush=True)
    if total_needed == 0:
        return maia_cache

    done = 0
    started = monotonic()
    last_log = started
    with cache_path.open("a", encoding="utf-8") as cache_file:
        for elo, unique_map in sorted(todo_by_elo.items()):
            todo_samples = list(unique_map.values())
            for batch, logits in session.predict(todo_samples, elo, "value_logits"):
                probs = np.exp(calibrate.log_softmax(logits[:, :3]))
                lines = []
                for sample, row in zip(batch, probs, strict=True):
                    p = row[::-1] if sample.turn == chess.WHITE else row
                    p = p.astype(np.float64)
                    maia_cache[(sample.token_hash, elo)] = p
                    lines.append(
                        json.dumps({"key": sample.token_hash, "elo": elo, "probs": p.tolist()}) + "\n"
                    )
                cache_file.writelines(lines)
                cache_file.flush()
                done += len(batch)
                now = monotonic()
                if done == total_needed or now - last_log >= 5.0:
                    elapsed = now - started
                    rate = done / elapsed if elapsed > 0 else 0.0
                    eta = (total_needed - done) / rate if rate > 0 else float("inf")
                    print(
                        f"Maia: {done:,}/{total_needed:,} ({done / total_needed:.1%}) "
                        f"| {rate:.1f} pos/s | elapsed {format_eta(elapsed)} "
                        f"| ETA {format_eta(eta)}",
                        flush=True,
                    )
                    last_log = now
    return maia_cache


def fit_multinomial_logistic(X, y, weights, l2=1e-4, penalize_last=False):
    """Fit 3-class multinomial logistic regression (class 1 = Draw as reference) via Newton."""
    n, k = X.shape
    w_norm = weights / np.sum(weights)
    pen = np.ones(k, dtype=np.float64)
    if not penalize_last:
        pen[-1] = 0.0
    pen_full = np.concatenate([pen, pen])

    y0 = (y == 0).astype(np.float64)
    y2 = (y == 2).astype(np.float64)
    theta = np.zeros(2 * k, dtype=np.float64)

    def eval_loss_and_probs(th):
        w_w = th[:k]
        w_b = th[k:]
        eta_w = X @ w_w
        eta_b = X @ w_b
        m = np.maximum(0.0, np.maximum(eta_w, eta_b))
        ew = np.exp(eta_w - m)
        ed = np.exp(-m)
        eb = np.exp(eta_b - m)
        z = ew + ed + eb
        pw = ew / z
        pb = eb / z
        nll = -(y0 * (eta_w - m) + y2 * (eta_b - m) + (1.0 - y0 - y2) * (-m)) + np.log(z)
        loss = float(np.sum(w_norm * nll) + 0.5 * l2 * np.sum(pen_full * (th ** 2)))
        return loss, pw, pb

    for _ in range(100):
        loss, pw, pb = eval_loss_and_probs(theta)
        w_w = theta[:k]
        w_b = theta[k:]
        gw = X.T @ (w_norm * (pw - y0)) + l2 * pen * w_w
        gb = X.T @ (w_norm * (pb - y2)) + l2 * pen * w_b
        grad = np.concatenate([gw, gb])

        h_ww_w = w_norm * pw * (1.0 - pw)
        h_bb_w = w_norm * pb * (1.0 - pb)
        h_wb_w = -w_norm * pw * pb
        h_ww = X.T @ (h_ww_w[:, None] * X) + np.diag(l2 * pen + 1e-12)
        h_bb = X.T @ (h_bb_w[:, None] * X) + np.diag(l2 * pen + 1e-12)
        h_wb = X.T @ (h_wb_w[:, None] * X)
        hess = np.block([[h_ww, h_wb], [h_wb, h_bb]])

        step = np.linalg.solve(hess, grad)
        if np.max(np.abs(step)) < 1e-9:
            return theta[:k], theta[k:]
        alpha = 1.0
        while alpha > 1e-12:
            cand_loss, _, _ = eval_loss_and_probs(theta - alpha * step)
            if cand_loss <= loss + 1e-12:
                break
            alpha *= 0.5
        theta -= alpha * step

    raise ValueError("Multinomial logistic regression did not converge")


def predict_multinomial(X, w_w, w_b):
    eta_w = X @ w_w
    eta_b = X @ w_b
    m = np.maximum(0.0, np.maximum(eta_w, eta_b))
    ew = np.exp(eta_w - m)
    ed = np.exp(-m)
    eb = np.exp(eta_b - m)
    z = ew + ed + eb
    return np.column_stack([ew / z, ed / z, eb / z])


def build_combined_features(maia_probs, cp, phase):
    clipped = np.clip(maia_probs, 1e-9, 1.0)
    log_w_d = np.log(clipped[:, 0]) - np.log(clipped[:, 1])
    log_b_d = np.log(clipped[:, 2]) - np.log(clipped[:, 1])
    e = np.tanh(cp / 400.0)
    ones = np.ones_like(e)
    return np.column_stack([log_w_d, log_b_d, e, e ** 2, e * phase, phase, ones])


def build_sf_features(cp, phase):
    e = np.tanh(cp / 400.0)
    ones = np.ones_like(e)
    return np.column_stack([e, e ** 2, e * phase, phase, ones])


def build_ply_features(plies):
    b1 = (plies <= 40).astype(np.float64)
    b2 = ((plies > 40) & (plies <= 80)).astype(np.float64)
    b3 = (plies > 80).astype(np.float64)
    return np.column_stack([b1, b2, b3])


def weighted_nll_vec(probs, outcomes):
    clipped = np.clip(probs[np.arange(len(outcomes)), outcomes], 1e-15, 1.0)
    return -np.log(clipped)


def weighted_ece(probs, outcomes, weights, n_bins=11):
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    total_w = float(np.sum(weights))
    eces = []
    for cls in (0, 1, 2):
        p = probs[:, cls]
        y_cls = (outcomes == cls).astype(np.float64)
        bin_idx = np.clip(np.digitize(p, edges, right=False) - 1, 0, n_bins - 1)
        ece = 0.0
        for b in range(n_bins):
            mask = bin_idx == b
            if not np.any(mask):
                continue
            w_b = float(np.sum(weights[mask]))
            if w_b <= 0:
                continue
            acc = float(np.sum(weights[mask] * y_cls[mask])) / w_b
            conf = float(np.sum(weights[mask] * p[mask])) / w_b
            ece += (w_b / total_w) * abs(acc - conf)
        eces.append(ece)
    return tuple(eces)


def bootstrap_event_metrics(event_keys, weights, outcomes, model_probs, n_boot=1000, seed=1503):
    """Compute point estimates and 95% event-cluster bootstrap CIs."""
    unique_events, inv = np.unique(event_keys, return_inverse=True)
    n_events = len(unique_events)

    ev_w = np.bincount(inv, weights=weights, minlength=n_events)
    ev_obs_draw = np.bincount(inv, weights=weights * (outcomes == 1), minlength=n_events)

    model_keys = tuple(model_probs.keys())
    ev_nll = {}
    ev_draw = {}
    for m in model_keys:
        p = model_probs[m]
        ev_nll[m] = np.bincount(inv, weights=weights * weighted_nll_vec(p, outcomes), minlength=n_events)
        ev_draw[m] = np.bincount(inv, weights=weights * p[:, 1], minlength=n_events)

    rng = np.random.default_rng(seed)
    idx = rng.integers(0, n_events, size=(n_boot, n_events))
    boot_w = ev_w[idx].sum(axis=1)

    obs_draw_point = float(ev_obs_draw.sum() / ev_w.sum())
    obs_draw_boot = ev_obs_draw[idx].sum(axis=1) / boot_w
    obs_draw_ci = (float(np.percentile(obs_draw_boot, 2.5)), float(np.percentile(obs_draw_boot, 97.5)))

    stats = {"observed_draw": (obs_draw_point, obs_draw_ci)}
    for m in model_keys:
        loss_pt = float(ev_nll[m].sum() / ev_w.sum())
        loss_boot = ev_nll[m][idx].sum(axis=1) / boot_w
        loss_ci = (float(np.percentile(loss_boot, 2.5)), float(np.percentile(loss_boot, 97.5)))

        draw_pt = float(ev_draw[m].sum() / ev_w.sum())
        draw_boot = ev_draw[m][idx].sum(axis=1) / boot_w
        draw_ci = (float(np.percentile(draw_boot, 2.5)), float(np.percentile(draw_boot, 97.5)))
        stats[m] = {
            "loss": (loss_pt, loss_ci),
            "draw": (draw_pt, draw_ci),
        }

    diff_pt = stats["d"]["loss"][0] - stats["b"]["loss"][0]
    diff_boot = (ev_nll["d"][idx].sum(axis=1) - ev_nll["b"][idx].sum(axis=1)) / boot_w
    diff_ci = (float(np.percentile(diff_boot, 2.5)), float(np.percentile(diff_boot, 97.5)))
    stats["d_minus_b_loss"] = (diff_pt, diff_ci)
    return stats


def fmt_ci(val, ci, fmt=".4f"):
    return f"{val:{fmt}} [{ci[0]:{fmt}}, {ci[1]:{fmt}}]"


def fmt_pct_ci(val, ci):
    return f"{val:.2%} [{ci[0]:.2%}, {ci[1]:.2%}]"


def main():
    started = monotonic()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgn", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--stockfish", default=DEFAULT_STOCKFISH, type=Path)
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR, type=Path)
    parser.add_argument("--seed", default=1503, type=int)
    parser.add_argument("--per-band", default=20000, type=int)
    parser.add_argument("--model-elos", type=calibrate.model_elos, default=DEFAULT_MODEL_ELOS)
    parser.add_argument("--workers", default=8, type=int)
    parser.add_argument("--bootstrap", default=1000, type=int)
    parser.add_argument("--out-ts", required=True, type=Path)
    parser.add_argument("--out-report", required=True, type=Path)
    args = parser.parse_args()
    if args.per_band < 2:
        parser.error("--per-band must be at least 2")

    calibrate.verify_encoder()
    calibrate.verify_phase()
    classical = load_classical_calibration()
    date = datetime.now(timezone.utc).date().isoformat()

    header_started = monotonic()
    eligible, sampled = sample_games_with_events(args.pgn, args.per_band, args.seed)
    header_seconds = monotonic() - header_started
    print(f"Header pass: {header_seconds:.1f} s. Eligible games: {dict(sorted(eligible.items()))}", flush=True)

    parse_started = monotonic()
    rng = random.Random(args.seed)
    samples_by_band = []
    split_meta = []
    with args.pgn.open(encoding="utf-8-sig", errors="replace") as stream:
        for band in BANDS:
            fit_items, held_items, n_fit_ev, n_held_ev = split_by_event(sampled[band], rng)
            fit_samples, fit_skipped = parse_combined_samples(stream, fit_items, rng)
            held_samples, held_skipped = parse_combined_samples(stream, held_items, rng)
            samples_by_band.append((fit_samples, held_samples))
            split_meta.append({
                "fit_games": len(fit_items),
                "held_games": len(held_items),
                "fit_events": n_fit_ev,
                "held_events": n_held_ev,
                "fit_pos": len(fit_samples),
                "held_pos": len(held_samples),
                "fit_skipped": fit_skipped,
                "held_skipped": held_skipped,
            })
            print(
                f"Band {band}: fit {len(fit_items):,} games ({n_fit_ev:,} events, {len(fit_samples):,} pos), "
                f"held {len(held_items):,} games ({n_held_ev:,} events, {len(held_samples):,} pos)",
                flush=True,
            )
    parse_seconds = monotonic() - parse_started

    needed_sf_depths = {}
    for fit_samples, held_samples in samples_by_band:
        for s in fit_samples:
            if s.fen not in needed_sf_depths:
                needed_sf_depths[s.fen] = 16
        for s in held_samples:
            needed_sf_depths[s.fen] = 20

    sf_started = monotonic()
    sf_cache = evaluate_stockfish(
        needed_sf_depths,
        args.stockfish,
        args.cache_dir / "stockfish_cache.jsonl",
        args.workers,
    )
    sf_seconds = monotonic() - sf_started

    maia_started = monotonic()
    with calibrate.Inference(args.model) as session:
        maia_workers = session.workers
        maia_cache = evaluate_maia_cached(
            session,
            samples_by_band,
            args.model_elos,
            args.cache_dir / "maia_cache.jsonl",
        )
    maia_seconds = monotonic() - maia_started

    fit_started = monotonic()
    band_results = []
    for i, (band, model_elo, (fit_samples, held_samples), meta) in enumerate(
        zip(BANDS, args.model_elos, samples_by_band, split_meta, strict=True)
    ):
        def unpack(samples, depth):
            n = len(samples)
            maia_p = np.array([maia_cache[(s.token_hash, model_elo)] for s in samples], dtype=np.float64)
            cp = np.array([sf_cache[(s.fen, depth)] for s in samples], dtype=np.float64)
            phase = np.array([s.phase for s in samples], dtype=np.float64)
            outcomes = np.array([s.outcome for s in samples], dtype=np.int64)
            plies = np.array([s.ply for s in samples], dtype=np.int64)
            weights = np.array([s.weight for s in samples], dtype=np.float64)
            events = np.array([s.event_key for s in samples])
            assert len(maia_p) == n
            return maia_p, cp, phase, outcomes, plies, weights, events

        f_maia, f_cp16, f_phase, f_y, f_ply, f_w, _ = unpack(fit_samples, 16)
        h_maia, h_cp16, h_phase, h_y, h_ply, h_w, h_ev = unpack(held_samples, 16)
        h_cp12 = np.array([sf_cache[(s.fen, 12)] for s in held_samples], dtype=np.float64)
        h_cp20 = np.array([sf_cache[(s.fen, 20)] for s in held_samples], dtype=np.float64)

        # (a) Rating + move number only (ply buckets)
        wa_w, wa_b = fit_multinomial_logistic(build_ply_features(f_ply), f_y, f_w, l2=1e-6, penalize_last=True)
        pa_held = predict_multinomial(build_ply_features(h_ply), wa_w, wa_b)

        # (b) Existing classical calibration from classical-calibration.ts
        c_elo, bias, slope = classical[band]
        assert c_elo == model_elo, f"Model Elo mismatch for {band}: {c_elo} != {model_elo}"
        pb_held = calibrate.calibrate_draw(h_maia, np.exp(bias + slope * h_phase))

        # (c) Stockfish only
        wc_w, wc_b = fit_multinomial_logistic(build_sf_features(f_cp16, f_phase), f_y, f_w, l2=1e-4)
        pc_held = predict_multinomial(build_sf_features(h_cp16, h_phase), wc_w, wc_b)

        # (d) Combined model, rounded to 4 decimals
        wd_w, wd_b = fit_multinomial_logistic(
            build_combined_features(f_maia, f_cp16, f_phase), f_y, f_w, l2=1e-4
        )
        wd_w = np.round(wd_w, 4)
        wd_b = np.round(wd_b, 4)

        pd_held_12 = predict_multinomial(build_combined_features(h_maia, h_cp12, h_phase), wd_w, wd_b)
        pd_held_16 = predict_multinomial(build_combined_features(h_maia, h_cp16, h_phase), wd_w, wd_b)
        pd_held_20 = predict_multinomial(build_combined_features(h_maia, h_cp20, h_phase), wd_w, wd_b)

        boot = bootstrap_event_metrics(
            h_ev,
            h_w,
            h_y,
            {"a": pa_held, "b": pb_held, "c": pc_held, "d": pd_held_16},
            n_boot=args.bootstrap,
            seed=args.seed + i,
        )
        ece_b = weighted_ece(pb_held, h_y, h_w, n_bins=11)
        ece_d = weighted_ece(pd_held_16, h_y, h_w, n_bins=11)

        depth_sens = {}
        for d_depth, pd_d in ((12, pd_held_12), (16, pd_held_16), (20, pd_held_20)):
            loss_d = float(np.sum(h_w * weighted_nll_vec(pd_d, h_y)) / np.sum(h_w))
            draw_d = float(np.sum(h_w * pd_d[:, 1]) / np.sum(h_w))
            depth_sens[d_depth] = (loss_d, draw_d)

        phase_buckets = []
        for label, mask in (
            ("≥0.75", h_phase >= 0.75),
            ("0.4–<0.75", (h_phase >= 0.4) & (h_phase < 0.75)),
            ("<0.4", h_phase < 0.4),
        ):
            cnt = int(np.sum(mask))
            if cnt == 0:
                phase_buckets.append((label, 0, 0.0, 0.0, 0.0, True, True))
                continue
            mw = h_w[mask]
            wsum = float(np.sum(mw))
            obs = float(np.sum(mw * (h_y[mask] == 1)) / wsum)
            db = float(np.sum(mw * pb_held[mask, 1]) / wsum)
            dd = float(np.sum(mw * pd_held_16[mask, 1]) / wsum)
            phase_buckets.append((label, cnt, obs, db, dd, abs(db - obs) <= 0.05, abs(dd - obs) <= 0.05))

        band_results.append({
            "band": band,
            "model_elo": model_elo,
            "meta": meta,
            "wd_w": wd_w,
            "wd_b": wd_b,
            "boot": boot,
            "ece_b": ece_b,
            "ece_d": ece_d,
            "depth_sens": depth_sens,
            "phase_buckets": phase_buckets,
        })
    fit_seconds = monotonic() - fit_started
    total_seconds = monotonic() - started

    # Generate TypeScript table
    source = f"{args.pgn.name}, CSSLab {args.model.name}, and {args.stockfish.name}"
    ts_lines = [
        "// Generated by scripts/maia/calibrate_combined.py.",
        f"// Source: {source}",
        f"// Date (UTC): {date}. Seed: {args.seed}.",
        "// Sampled games by band (fit / held-out): " + ", ".join(
            f"{r['band']}: {r['meta']['fit_games']} / {r['meta']['held_games']}" for r in band_results
        ),
        "// Sampled positions by band (fit / held-out): " + ", ".join(
            f"{r['band']}: {r['meta']['fit_pos']} / {r['meta']['held_pos']}" for r in band_results
        ),
        "// Multinomial logistic regression with Draw as reference class (logit_D = 0):",
        "//   logit_W = dot(white, x), logit_B = dot(black, x), probs = softmax([logit_W, 0, logit_B]).",
        "// Features x in exact order:",
        "//   0: log(pW) - log(pD)   (raw Maia value head, White vs Draw log-odds)",
        "//   1: log(pB) - log(pD)   (raw Maia value head, Black vs Draw log-odds)",
        "//   2: e = tanh(cp / 400)  (cp from White's POV, clamped to [-1000, 1000], mate = +-1000)",
        "//   3: e^2",
        "//   4: e * phase           (materialPhase(fen) from src/engine/maia/phase.ts)",
        "//   5: phase",
        "//   6: 1                   (intercept)",
        "export const MAIA_COMBINED_FEATURES = [",
        *(f'  "{name}",' for name in FEATURE_NAMES),
        "] as const;",
        "",
        "export const MAIA_COMBINED_CALIBRATION = [",
    ]
    for r in band_results:
        w_str = ", ".join(f"{v:.4f}" for v in r["wd_w"])
        b_str = ", ".join(f"{v:.4f}" for v in r["wd_b"])
        ts_lines.extend([
            "  {",
            f"    elo: {r['band']},",
            f"    modelElo: {r['model_elo']},",
            f"    white: [{w_str}],",
            f"    black: [{b_str}],",
            "  },",
        ])
    ts_lines.append("] as const;")

    # Generate Markdown report
    report = [
        "# Maia-3 + Stockfish combined classical calibration",
        "",
        f"Run on {date} UTC using {source}.",
        f"Seed {args.seed}, requested {args.per_band:,} games per band, {args.bootstrap:,} event-cluster bootstrap resamples.",
        "",
        "Games are split by tournament (`Event` + year from `Date`), assigning whole events to held-out (~20% of games per band) with zero event overlap.",
        "Positions are sampled from the grid of plies 16, 26, 36, ... strictly before the terminal position (up to 3 per game), weighted by `eligible grid plies / selected`.",
        "Stockfish scores are converted to White's POV in centipawns, with mate mapped to ±1000 and all scores clamped to ±1000.",
        "",
        "## Sample sizes",
        "",
    ]
    calibrate.table(
        report,
        (
            "Band",
            "Eligible games",
            "Games fit / held",
            "Events fit / held",
            "Positions fit / held",
            "Unusable PGNs fit / held",
        ),
    )
    for r in band_results:
        b = r["band"]
        m = r["meta"]
        report.append(
            f"| {b} | {eligible[b]:,} | {m['fit_games']:,} / {m['held_games']:,} "
            f"| {m['fit_events']:,} / {m['held_events']:,} "
            f"| {m['fit_pos']:,} / {m['held_pos']:,} "
            f"| {m['fit_skipped']['unusable PGN']} / {m['held_skipped']['unusable PGN']} |"
        )

    report.extend([
        "",
        "## Held-out log loss (with 95% event-bootstrap CI)",
        "",
    ])
    calibrate.table(
        report,
        (
            "Band",
            "(a) Ply only",
            "(b) Classical Maia",
            "(c) Stockfish d16",
            "(d) Combined d16",
            "d − b (95% CI)",
        ),
    )
    for r in band_results:
        bt = r["boot"]
        report.append(
            f"| {r['band']} "
            f"| {fmt_ci(*bt['a']['loss'])} "
            f"| {fmt_ci(*bt['b']['loss'])} "
            f"| {fmt_ci(*bt['c']['loss'])} "
            f"| {fmt_ci(*bt['d']['loss'])} "
            f"| {fmt_ci(*bt['d_minus_b_loss'])} |"
        )

    report.extend([
        "",
        "## Held-out draw rate (with 95% event-bootstrap CI)",
        "",
    ])
    calibrate.table(
        report,
        (
            "Band",
            "Observed",
            "(a) Ply only",
            "(b) Classical Maia",
            "(c) Stockfish d16",
            "(d) Combined d16",
            "b within 3 pp?",
            "d within 3 pp?",
        ),
    )
    for r in band_results:
        bt = r["boot"]
        obs_pt, obs_ci = bt["observed_draw"]
        b_pt, b_ci = bt["b"]["draw"]
        d_pt, d_ci = bt["d"]["draw"]
        b_ok = "Yes" if abs(b_pt - obs_pt) <= 0.03 else "No"
        d_ok = "Yes" if abs(d_pt - obs_pt) <= 0.03 else "No"
        report.append(
            f"| {r['band']} "
            f"| {fmt_pct_ci(obs_pt, obs_ci)} "
            f"| {fmt_pct_ci(*bt['a']['draw'])} "
            f"| {fmt_pct_ci(b_pt, b_ci)} "
            f"| {fmt_pct_ci(*bt['c']['draw'])} "
            f"| {fmt_pct_ci(d_pt, d_ci)} "
            f"| {b_ok} | {d_ok} |"
        )

    report.extend([
        "",
        "## Held-out per-class ECE (11 bins)",
        "",
    ])
    calibrate.table(
        report,
        ("Band", "(b) White", "(b) Draw", "(b) Black", "(d) White", "(d) Draw", "(d) Black"),
    )
    for r in band_results:
        eb = r["ece_b"]
        ed = r["ece_d"]
        report.append(
            f"| {r['band']} "
            f"| {eb[0]:.4f} | {eb[1]:.4f} | {eb[2]:.4f} "
            f"| {ed[0]:.4f} | {ed[1]:.4f} | {ed[2]:.4f} |"
        )

    report.extend([
        "",
        "## Held-out draw rate by phase bucket",
        "",
    ])
    calibrate.table(
        report,
        (
            "Band",
            "Phase",
            "Positions",
            "Observed draw",
            "(b) Draw",
            "(d) Draw",
            "b within 5 pp?",
            "d within 5 pp?",
        ),
    )
    for r in band_results:
        for label, cnt, obs, db, dd, b_ok, d_ok in r["phase_buckets"]:
            report.append(
                f"| {r['band']} | {label} | {cnt:,} | {obs:.2%} | {db:.2%} | {dd:.2%} "
                f"| {'Yes' if b_ok else 'No'} | {'Yes' if d_ok else 'No'} |"
            )

    report.extend([
        "",
        "## Depth sensitivity (model d fitted on depth 16, evaluated on held-out)",
        "",
    ])
    calibrate.table(
        report,
        ("Band", "Depth 12 loss / draw", "Depth 16 loss / draw", "Depth 20 loss / draw"),
    )
    for r in band_results:
        ds = r["depth_sens"]
        report.append(
            f"| {r['band']} "
            f"| {ds[12][0]:.4f} / {ds[12][1]:.2%} "
            f"| {ds[16][0]:.4f} / {ds[16][1]:.2%} "
            f"| {ds[20][0]:.4f} / {ds[20][1]:.2%} |"
        )

    report.extend([
        "",
        "## Runtime",
        "",
        f"- Header pass: {header_seconds:.1f} s",
        f"- Sample parsing: {parse_seconds:.1f} s",
        f"- Stockfish ({args.workers} workers, Threads=1, Hash=64): {sf_seconds:.1f} s",
        f"- Maia ({maia_workers} workers, batch={calibrate.BATCH}): {maia_seconds:.1f} s",
        f"- Model fitting, baselines & bootstrap: {fit_seconds:.1f} s",
        f"- Total: {total_seconds:.1f} s",
        "",
        "## Reproduction",
        "",
        "```sh",
        'maia_tmp="$(mktemp -d)"',
        'python3 -m venv "$maia_tmp/venv"',
        f'"$maia_tmp/venv/bin/pip" install onnxruntime=={ort.__version__} '
        f"python-chess==1.999 numpy=={np.__version__}",
        '"$maia_tmp/venv/bin/python" ' + shlex.join(sys.argv),
        "```",
    ])

    for path, lines in ((args.out_ts, ts_lines), (args.out_report, report)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {args.out_ts} and {args.out_report} in {total_seconds:.1f} s", flush=True)


if __name__ == "__main__":
    main()
