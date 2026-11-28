#!/usr/bin/env python3
"""Score move-prediction positions with Toby 2 (unmodified UCI binary)."""

import argparse
from contextlib import ExitStack
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

DEFAULT_TOBY_BIN = "/home/danilo/toby/release/Toby/toby"
RATING_SOURCES = (
    "FIDE",
    "Lichess Classical",
    "Lichess Rapid",
    "Lichess Blitz",
    "Chess.com Rapid",
    "Chess.com Blitz",
)
TIME_CONTROL_MAP = {
    "classical": "Classical",
    "rapid": "Rapid",
    "blitz": "Blitz",
}
MOVE_LINE_RE = re.compile(r"^info string toby move (\S+) san \S+ prob ([0-9.]+)")


def parse_time_control(raw):
    """Parse a PGN TimeControl string into (base_s, inc_s), or (0, -1) if unknown."""
    if not raw or not isinstance(raw, str):
        return 0, -1
    s = raw.strip()
    if s in ("", "-", "?", "*"):
        return 0, -1
    # Multi-stage time controls like "40/5400+30:1800+30" -> take first stage.
    stage = s.split(":", 1)[0].strip()
    if "/" in stage:
        stage = stage.split("/", 1)[1].strip()
    if "+" in stage:
        base_str, inc_str = stage.split("+", 1)
        try:
            return max(0, int(float(base_str))), max(0, int(float(inc_str)))
        except ValueError:
            return 0, -1
    try:
        return max(0, int(float(stage))), 0
    except ValueError:
        return 0, -1


def load_done_ids(output_path):
    """Return the set of position IDs already present in output_path."""
    done = set()
    if not output_path.exists():
        return done
    with output_path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as exc:
                print(
                    f"Warning: ignoring malformed line {line_no} in {output_path}: {exc}",
                    file=sys.stderr,
                )
                continue
            if "id" in rec:
                done.add(rec["id"])
    return done


class TobyUCI:
    """Thin wrapper around the unmodified Toby UCI executable."""

    def __init__(self, toby_bin, product="Accurate", rating_source="FIDE", leela_head="Product", device="Auto"):
        self.toby_bin = str(toby_bin)
        self.product = product
        self.rating_source = rating_source
        self.leela_head = leela_head
        self.device = device
        self.proc = None
        self.cur_opts = {}

    def start(self):
        env = dict(os.environ)
        env["TOBY2_PRODUCT"] = self.product
        self.proc = subprocess.Popen(
            [self.toby_bin],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        self._send("uci")
        self._read_until(lambda line: line == "uciok")
        self._set_option("Toby 2 Product", self.product)
        self._set_option("Display", "Full")
        self._set_option("Provisional Lines", "false")
        self._set_option("MultiPV", "500")
        self._set_option("Rating Source", self.rating_source)
        self._set_option("Leela Head", self.leela_head)
        self._set_option("Network Device", self.device)
        self._send("isready")
        self._read_until(lambda line: line == "readyok")

    def _send(self, cmd):
        self.proc.stdin.write(cmd + "\n")
        self.proc.stdin.flush()

    def _read_until(self, pred):
        lines = []
        while True:
            raw = self.proc.stdout.readline()
            if not raw:
                raise RuntimeError("Toby process exited unexpectedly")
            line = raw.rstrip("\r\n")
            lines.append(line)
            if pred(line):
                return lines

    def _set_option(self, name, value):
        sval = str(value)
        if self.cur_opts.get(name) == sval:
            return
        self._send(f"setoption name {name} value {sval}")
        self.cur_opts[name] = sval

    def evaluate(self, rec, movetime_ms=30000):
        """Evaluate a single position record and return (top_moves, path_info, elapsed_s)."""
        w_elo = int(rec["white_elo"]) if rec.get("white_elo") is not None else 0
        b_elo = int(rec["black_elo"]) if rec.get("black_elo") is not None else 0
        tc_class = TIME_CONTROL_MAP.get(str(rec.get("time_control_class") or "classical").lower(), "Classical")
        base_s, inc_s = parse_time_control(rec.get("time_control"))

        self._set_option("White Rating", w_elo)
        self._set_option("Black Rating", b_elo)
        self._set_option("Time Control", tc_class)
        self._set_option("Base Time", base_s)
        self._set_option("Increment", inc_s)

        moves_uci = rec.get("moves_uci")
        if isinstance(moves_uci, list):
            if moves_uci:
                pos_cmd = "position startpos moves " + " ".join(moves_uci)
            else:
                pos_cmd = "position startpos"
        elif rec.get("fen"):
            pos_cmd = f"position fen {rec['fen']}"
        else:
            raise ValueError(f"Position {rec.get('id')} has neither moves_uci nor fen")

        cw = rec.get("clock_white_s")
        cb = rec.get("clock_black_s")
        go_parts = ["go", "movetime", str(movetime_ms)]
        if cw is not None and cb is not None:
            go_parts.extend(["wtime", str(max(0, int(round(float(cw) * 1000))))])
            go_parts.extend(["btime", str(max(0, int(round(float(cb) * 1000))))])
            if inc_s >= 0:
                inc_ms = str(inc_s * 1000)
                go_parts.extend(["winc", inc_ms, "binc", inc_ms])

        t0 = time.monotonic()
        self._send(pos_cmd)
        self._send(" ".join(go_parts))
        lines = self._read_until(lambda line: line.startswith("bestmove "))
        elapsed = time.monotonic() - t0

        # Parse only the final stage block (final 1).
        in_final = False
        top = []
        path_info = None
        for line in lines:
            if line.startswith("info string toby path "):
                try:
                    path_info = json.loads(line[len("info string toby path "):])
                except json.JSONDecodeError:
                    pass
            elif line.startswith("info string toby begin "):
                if " final 1 " in f" {line} ":
                    in_final = True
                    top = []
            elif line.startswith("info string toby end "):
                in_final = False
            elif in_final:
                m = MOVE_LINE_RE.match(line)
                if m:
                    top.append([m.group(1), float(m.group(2))])

        if not top:
            raise RuntimeError(f"Toby printed no final move block for position {rec['id']}")
        top.sort(key=lambda item: -item[1])
        return top, path_info, elapsed

    def close(self):
        if self.proc is not None:
            try:
                if self.proc.poll() is None:
                    self._send("quit")
                    self.proc.wait(timeout=10)
            except Exception as exc:
                print(f"Warning: Toby did not shut down cleanly: {exc}", file=sys.stderr)
                self.proc.kill()
            finally:
                self.proc = None

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()


def format_variant(product, tc_class, path_info):
    """Build a concise variant string from Toby's reported path or options."""
    if isinstance(path_info, dict) and path_info.get("product"):
        prod = path_info["product"]
        cadence = path_info.get("cadence") or tc_class.lower()
        return f"{prod}/{cadence}"
    return f"Toby 2 {product}/{tc_class.lower()}"


def main():
    parser = argparse.ArgumentParser(description="Run Toby 2 on move-prediction positions JSONL.")
    parser.add_argument("--input", "-i", required=True, type=Path, help="Input positions JSONL path")
    parser.add_argument("--output", "-o", required=True, type=Path, help="Output predictions JSONL path")
    parser.add_argument("--toby-bin", type=Path, default=Path(DEFAULT_TOBY_BIN), help="Path to Toby UCI binary")
    parser.add_argument("--product", choices=("Accurate", "Standard"), default="Accurate", help="Toby 2 Product")
    parser.add_argument("--rating-source", choices=RATING_SOURCES, default="FIDE", help="UCI Rating Source")
    parser.add_argument("--leela-head", choices=("Product", "On", "Off"), default="Product", help="Leela Head option")
    parser.add_argument("--device", choices=("Auto", "CPU", "GPU"), default="Auto", help="Network Device option")
    parser.add_argument("--movetime-ms", type=int, default=30000, help="UCI movetime budget per position (ms)")
    parser.add_argument("--limit", type=int, default=0, help="Optional max positions to process in this run")
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    done_ids = load_done_ids(args.output)
    if done_ids:
        print(f"Resuming: {len(done_ids)} positions already in {args.output}", file=sys.stderr)

    pending = []
    with args.input.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec["id"] in done_ids:
                continue
            pending.append(rec)
            if args.limit > 0 and len(pending) >= args.limit:
                break

    if not pending:
        print("Nothing to do: all input positions already scored.", file=sys.stderr)
        return

    print(f"Scoring {len(pending)} positions with {args.toby_bin} ({args.product})...", file=sys.stderr)
    t_start = time.monotonic()

    with ExitStack() as stack:
        engine = stack.enter_context(
            TobyUCI(
                args.toby_bin,
                product=args.product,
                rating_source=args.rating_source,
                leela_head=args.leela_head,
                device=args.device,
            )
        )
        out_f = stack.enter_context(args.output.open("a", encoding="utf-8"))

        for idx, rec in enumerate(pending, 1):
            try:
                top, path_info, sec = engine.evaluate(rec, movetime_ms=args.movetime_ms)
            except Exception as exc:
                raise RuntimeError(f"Toby failed on position {rec['id']} ({idx}/{len(pending)})") from exc
            reported = path_info.get("product", "") if isinstance(path_info, dict) else ""
            if args.product == "Accurate" and "Accurate" not in reported:
                raise RuntimeError(
                    f"Toby reported product {reported!r} instead of Accurate (GPU not visible?); aborting"
                )
            played = rec.get("played_uci")
            prob_map = {u: p for u, p in top}
            p_played = prob_map.get(played)
            tc_class = TIME_CONTROL_MAP.get(str(rec.get("time_control_class") or "classical").lower(), "Classical")

            out_rec = {
                "id": rec["id"],
                "top": top,
                "p_played": p_played,
                "variant": format_variant(args.product, tc_class, path_info),
                "seconds": round(sec, 4),
            }
            out_f.write(json.dumps(out_rec) + "\n")
            out_f.flush()

            if idx % 25 == 0 or idx == len(pending):
                elapsed = time.monotonic() - t_start
                rate = idx / elapsed if elapsed > 0 else 0.0
                print(
                    f"[{idx}/{len(pending)}] {rate:.2f} pos/s ({elapsed:.1f}s elapsed)",
                    file=sys.stderr,
                )


if __name__ == "__main__":
    main()
