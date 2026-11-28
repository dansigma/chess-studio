"""Convert Toby runner output (run_toby.py) into the per-position prediction format used by analyze_results.py."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

DATA_DIR = Path("/home/danilo/data/maia/humanfish-nov2026")
LOG_PROB_CLIP = 1e-9


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--positions", type=Path, default=DATA_DIR / "positions.jsonl")
    parser.add_argument("--toby", type=Path, default=DATA_DIR / "toby_raw.jsonl")
    parser.add_argument("--out", type=Path, default=DATA_DIR / "preds" / "toby2_accurate.jsonl")
    args = parser.parse_args()

    toby = {}
    for line in args.toby.read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            toby[row["id"]] = row

    missing_played = 0
    variants: dict[str, int] = {}
    with args.out.open("w", encoding="utf-8") as out:
        for line in args.positions.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            pos = json.loads(line)
            row = toby.get(pos["id"])
            if row is None:
                raise KeyError(f"Toby output has no row for position {pos['id']}; rerun run_toby.py to finish")
            variants[row["variant"]] = variants.get(row["variant"], 0) + 1
            ranked = [uci for uci, _ in sorted(row["top"], key=lambda m: -m[1])]
            played = pos["played_uci"]
            # Toby lists only moves it considers playable; an unlisted played move gets the clip floor.
            p_played = row["p_played"]
            if p_played is None:
                missing_played += 1
                p_played = LOG_PROB_CLIP
            out.write(
                json.dumps(
                    {
                        "id": pos["id"],
                        "game_id": pos["game_id"],
                        "time_control_class": pos["time_control_class"],
                        "top1": int(bool(ranked) and ranked[0] == played),
                        "top3": int(played in ranked[:3]),
                        "p_played": p_played,
                        "log_prob": math.log(max(p_played, LOG_PROB_CLIP)),
                        "pred_top3": ranked[:3],
                        "variant": row["variant"],
                    }
                )
                + "\n"
            )
    print(f"Wrote {args.out}; variants={variants}; played move not listed by Toby: {missing_played}")


if __name__ == "__main__":
    main()
