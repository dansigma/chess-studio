# Maia-3 + Stockfish combined classical calibration

Run on 2026-11-27 UTC using LumbrasGigabase_OTB_Complete.pgn, CSSLab maia3-5m.onnx, and stockfish-19.
Seed 1503, requested 20,000 games per band, 1,000 event-cluster bootstrap resamples.

Games are split by tournament (`Event` + year from `Date`), assigning whole events to held-out (~20% of games per band) with zero event overlap.
Positions are sampled from the grid of plies 16, 26, 36, ... strictly before the terminal position (up to 3 per game), weighted by `eligible grid plies / selected`.
Stockfish scores are converted to White's POV in centipawns, with mate mapped to ±1000 and all scores clamped to ±1000.

## Sample sizes

| Band | Eligible games | Games fit / held | Events fit / held | Positions fit / held | Unusable PGNs fit / held |
| --- | --- | --- | --- | --- | --- |
| 1800 | 408,123 | 16,000 / 4,000 | 9,217 / 2,346 | 46,415 / 11,619 | 0 / 0 |
| 2000 | 539,771 | 16,000 / 4,000 | 9,949 / 2,481 | 46,240 / 11,605 | 0 / 0 |
| 2200 | 634,212 | 15,994 / 4,006 | 9,809 / 2,531 | 45,986 / 11,556 | 0 / 0 |
| 2400 | 575,899 | 16,000 / 4,000 | 8,830 / 2,281 | 45,779 / 11,360 | 0 / 0 |
| 2600 | 220,925 | 16,000 / 4,000 | 5,444 / 1,195 | 46,133 / 11,514 | 0 / 0 |

## Held-out log loss (with 95% event-bootstrap CI)

| Band | (a) Ply only | (b) Classical Maia | (c) Stockfish d16 | (d) Combined d16 | d − b (95% CI) |
| --- | --- | --- | --- | --- | --- |
| 1800 | 1.0874 [1.0823, 1.0924] | 0.9082 [0.8965, 0.9201] | 0.8501 [0.8341, 0.8665] | 0.8404 [0.8243, 0.8565] | -0.0678 [-0.0767, -0.0586] |
| 2000 | 1.0954 [1.0922, 1.0987] | 0.9295 [0.9199, 0.9399] | 0.8596 [0.8446, 0.8743] | 0.8488 [0.8335, 0.8639] | -0.0808 [-0.0900, -0.0712] |
| 2200 | 1.0801 [1.0745, 1.0858] | 0.9361 [0.9255, 0.9477] | 0.8448 [0.8260, 0.8632] | 0.8377 [0.8193, 0.8571] | -0.0984 [-0.1101, -0.0862] |
| 2400 | 1.0528 [1.0420, 1.0651] | 0.8894 [0.8767, 0.9022] | 0.7962 [0.7778, 0.8135] | 0.7868 [0.7676, 0.8044] | -0.1026 [-0.1144, -0.0916] |
| 2600 | 1.0547 [1.0393, 1.0712] | 0.8988 [0.8831, 0.9161] | 0.8105 [0.7889, 0.8331] | 0.8000 [0.7784, 0.8236] | -0.0988 [-0.1091, -0.0874] |

## Held-out draw rate (with 95% event-bootstrap CI)

| Band | Observed | (a) Ply only | (b) Classical Maia | (c) Stockfish d16 | (d) Combined d16 | b within 3 pp? | d within 3 pp? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | 26.84% [25.32%, 28.33%] | 26.80% [26.77%, 26.84%] | 26.40% [26.07%, 26.73%] | 27.12% [26.65%, 27.60%] | 26.97% [26.47%, 27.48%] | Yes | Yes |
| 2000 | 31.18% [29.53%, 32.74%] | 32.79% [32.77%, 32.82%] | 32.32% [32.02%, 32.64%] | 33.17% [32.68%, 33.64%] | 33.22% [32.71%, 33.72%] | Yes | Yes |
| 2200 | 40.01% [38.30%, 41.88%] | 39.29% [39.24%, 39.34%] | 37.63% [37.27%, 37.98%] | 39.67% [39.11%, 40.22%] | 39.63% [39.01%, 40.21%] | Yes | Yes |
| 2400 | 47.11% [45.19%, 48.98%] | 47.32% [47.25%, 47.40%] | 46.03% [45.62%, 46.45%] | 47.56% [46.96%, 48.22%] | 47.49% [46.83%, 48.15%] | Yes | Yes |
| 2600 | 46.41% [43.91%, 48.74%] | 48.07% [48.01%, 48.13%] | 47.02% [46.44%, 47.55%] | 47.43% [46.57%, 48.27%] | 47.38% [46.44%, 48.25%] | Yes | Yes |

## Held-out per-class ECE (11 bins)

| Band | (b) White | (b) Draw | (b) Black | (d) White | (d) Draw | (d) Black |
| --- | --- | --- | --- | --- | --- | --- |
| 1800 | 0.0521 | 0.0234 | 0.0595 | 0.0114 | 0.0141 | 0.0184 |
| 2000 | 0.0456 | 0.0342 | 0.0522 | 0.0266 | 0.0269 | 0.0254 |
| 2200 | 0.0448 | 0.0380 | 0.0531 | 0.0225 | 0.0202 | 0.0278 |
| 2400 | 0.0358 | 0.0212 | 0.0380 | 0.0254 | 0.0244 | 0.0192 |
| 2600 | 0.0276 | 0.0178 | 0.0231 | 0.0207 | 0.0316 | 0.0213 |

## Held-out draw rate by phase bucket

| Band | Phase | Positions | Observed draw | (b) Draw | (d) Draw | b within 5 pp? | d within 5 pp? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | ≥0.75 | 6,304 | 24.83% | 25.73% | 26.23% | Yes | Yes |
| 1800 | 0.4–<0.75 | 3,050 | 26.61% | 24.47% | 25.34% | Yes | Yes |
| 1800 | <0.4 | 2,265 | 30.55% | 29.48% | 29.90% | Yes | Yes |
| 2000 | ≥0.75 | 6,413 | 30.41% | 32.53% | 32.49% | Yes | Yes |
| 2000 | 0.4–<0.75 | 3,016 | 30.42% | 30.35% | 31.83% | Yes | Yes |
| 2000 | <0.4 | 2,176 | 33.40% | 33.99% | 36.02% | Yes | Yes |
| 2200 | ≥0.75 | 6,457 | 42.79% | 38.61% | 40.58% | Yes | Yes |
| 2200 | 0.4–<0.75 | 2,964 | 37.59% | 35.88% | 38.20% | Yes | Yes |
| 2200 | <0.4 | 2,135 | 37.32% | 37.62% | 39.36% | Yes | Yes |
| 2400 | ≥0.75 | 6,431 | 49.19% | 48.12% | 48.78% | Yes | Yes |
| 2400 | 0.4–<0.75 | 2,974 | 44.29% | 44.03% | 44.88% | Yes | Yes |
| 2400 | <0.4 | 1,955 | 46.06% | 44.04% | 47.82% | Yes | Yes |
| 2600 | ≥0.75 | 5,932 | 45.25% | 46.68% | 47.29% | Yes | Yes |
| 2600 | 0.4–<0.75 | 3,065 | 44.31% | 45.93% | 45.01% | Yes | Yes |
| 2600 | <0.4 | 2,517 | 50.10% | 48.56% | 49.73% | Yes | Yes |

## Depth sensitivity (model d fitted on depth 16, evaluated on held-out)

| Band | Depth 12 loss / draw | Depth 16 loss / draw | Depth 20 loss / draw |
| --- | --- | --- | --- |
| 1800 | 0.8401 / 27.48% | 0.8404 / 26.97% | 0.8420 / 26.53% |
| 2000 | 0.8493 / 33.85% | 0.8488 / 33.22% | 0.8488 / 32.67% |
| 2200 | 0.8407 / 40.25% | 0.8377 / 39.63% | 0.8382 / 39.10% |
| 2400 | 0.7878 / 47.98% | 0.7868 / 47.49% | 0.7865 / 47.01% |
| 2600 | 0.8012 / 48.00% | 0.8000 / 47.38% | 0.8046 / 46.86% |

## Runtime

- Header pass: 226.9 s
- Sample parsing: 321.1 s
- Stockfish (8 workers, Threads=1, Hash=64): 30504.5 s
- Maia (8 workers, batch=128): 1381.2 s
- Model fitting, baselines & bootstrap: 1.9 s
- Total: 32435.7 s

## Reproduction

```sh
maia_tmp="$(mktemp -d)"
python3 -m venv "$maia_tmp/venv"
"$maia_tmp/venv/bin/pip" install onnxruntime==1.32.0 python-chess==1.999 numpy==2.4.6
"$maia_tmp/venv/bin/python" scripts/maia/calibrate_combined.py --pgn /home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn --model /home/danilo/data/maia/maia3-5m.onnx --stockfish /home/danilo/data/stockfish/stockfish-19 --cache-dir /home/danilo/data/maia/cache --seed 1503 --per-band 20000 --out-ts src/engine/maia/classical-combined.ts --out-report scripts/maia/combined-report.md
```
