# Maia-3 classical calibration

Run on 2026-11-26 UTC using LumbrasGigabase_OTB_Complete.pgn and CSSLab maia3-5m.onnx.
Seed 1503, requested 6,000 games per band.

The header scan admits games with missing TimeControl if they pass the other filters. Some fast games may therefore remain in the sample. The 2600 band starts at mean Elo 2500.
Ply counts half-moves played before the sampled position. Fit and held-out samples come from disjoint games. Move metrics use up to three uniformly sampled positions per game, with ply ≥ 10. Value metrics use plies 16, 26, 36 and every tenth ply thereafter. Each game contributes one equally weighted position at each of those plies it reaches before the terminal position.

## Sample sizes

| Band | Eligible games | Games fit / held | Move positions fit / held | Value positions fit / held | Unusable PGNs fit / held |
| --- | --- | --- | --- | --- | --- |
| 1800 | 408,123 | 4,800 / 1,200 | 14,395 / 3,598 | 32,300 / 8,043 | 0 / 0 |
| 2000 | 539,771 | 4,800 / 1,200 | 14,389 / 3,598 | 33,206 / 8,145 | 0 / 0 |
| 2200 | 634,212 | 4,800 / 1,200 | 14,385 / 3,599 | 33,177 / 8,472 | 0 / 0 |
| 2400 | 575,899 | 4,800 / 1,200 | 14,380 / 3,598 | 33,103 / 8,253 | 0 / 0 |
| 2600 | 220,925 | 4,800 / 1,200 | 14,386 / 3,598 | 36,166 / 8,734 | 0 / 0 |

## Model Elo mapping

The spaced model Elo mapping is a product choice. The raw argmax maximises fit legal-move mean log likelihood on the 100 Elo grid, reaching 2900 in the top three bands in the original sweep.
Fit grid metrics come from the original sweep in rating-sweep.json. The game splits and sampled move positions are preserved.
Held-out move metrics were recomputed at the chosen input and the fit argmax.
Each metric pair is mean legal-move log likelihood / top-1 accuracy.

| Band | Chosen Elo | Fit argmax Elo | Held-out moves | Fit chosen | Fit argmax | Held-out chosen | Held-out argmax |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | 2300 | 2300 | 3,598 | -1.4093 / 53.80% | -1.4093 / 53.80% | -1.4339 / 53.06% | -1.4339 / 53.06% |
| 2000 | 2500 | 2700 | 3,598 | -1.3950 / 53.95% | -1.3917 / 54.03% | -1.4027 / 53.78% | -1.3934 / 54.09% |
| 2200 | 2700 | 2900 | 3,599 | -1.4076 / 53.30% | -1.3976 / 53.46% | -1.4138 / 53.79% | -1.4045 / 53.40% |
| 2400 | 2900 | 2900 | 3,598 | -1.3721 / 53.64% | -1.3721 / 53.64% | -1.3811 / 54.59% | -1.3811 / 54.59% |
| 2600 | 2900 | 2900 | 3,598 | -1.3423 / 54.32% | -1.3423 / 54.32% | -1.3271 / 55.39% | -1.3271 / 55.39% |

Fit legal-move mean log likelihood / top-1 accuracy by rating.

| Model input | 1800 | 2000 | 2200 | 2400 | 2600 |
| --- | --- | --- | --- | --- | --- |
| 1500 | -1.5809 / 48.33% | -1.6533 / 46.58% | -1.7279 / 45.06% | -1.7364 / 44.87% | -1.7093 / 44.68% |
| 1600 | -1.5509 / 48.96% | -1.6205 / 47.51% | -1.6958 / 45.85% | -1.7046 / 45.82% | -1.6778 / 45.54% |
| 1700 | -1.5215 / 49.70% | -1.5868 / 48.49% | -1.6618 / 46.63% | -1.6710 / 46.53% | -1.6445 / 46.41% |
| 1800 | -1.4926 / 50.59% | -1.5515 / 49.64% | -1.6252 / 47.67% | -1.6344 / 47.31% | -1.6083 / 47.41% |
| 1900 | -1.4651 / 51.49% | -1.5155 / 50.62% | -1.5861 / 48.62% | -1.5949 / 48.30% | -1.5694 / 48.64% |
| 2000 | -1.4412 / 52.19% | -1.4807 / 51.37% | -1.5465 / 49.66% | -1.5541 / 49.49% | -1.5292 / 49.70% |
| 2100 | -1.4230 / 52.82% | -1.4498 / 52.47% | -1.5092 / 50.42% | -1.5144 / 50.47% | -1.4900 / 50.76% |
| 2200 | -1.4123 / 53.35% | -1.4254 / 53.21% | -1.4770 / 51.46% | -1.4790 / 51.59% | -1.4544 / 51.65% |
| 2300 | -1.4093 / 53.80% | -1.4087 / 53.72% | -1.4523 / 52.20% | -1.4502 / 52.16% | -1.4250 / 52.44% |
| 2400 | -1.4120 / 53.75% | -1.3994 / 53.92% | -1.4352 / 52.61% | -1.4288 / 52.86% | -1.4028 / 53.16% |
| 2500 | -1.4173 / 53.69% | -1.3950 / 53.95% | -1.4239 / 52.91% | -1.4135 / 53.21% | -1.3867 / 53.64% |
| 2600 | -1.4230 / 53.65% | -1.3930 / 54.03% | -1.4156 / 53.21% | -1.4016 / 53.30% | -1.3740 / 54.03% |
| 2700 | -1.4286 / 53.62% | -1.3917 / 54.03% | -1.4076 / 53.30% | -1.3901 / 53.43% | -1.3616 / 54.21% |
| 2800 | -1.4365 / 53.46% | -1.3924 / 53.88% | -1.3997 / 53.24% | -1.3783 / 53.59% | -1.3489 / 54.38% |
| 2900 | -1.4526 / 52.97% | -1.4012 / 53.51% | -1.3976 / 53.46% | -1.3721 / 53.64% | -1.3423 / 54.32% |
| 3000 | -1.4835 / 52.13% | -1.4273 / 52.94% | -1.4124 / 53.03% | -1.3835 / 53.23% | -1.3537 / 54.20% |

## Draw model fit

Phase is both sides’ non-pawn material divided by 62 (N and B = 3, R = 5, Q = 9). The phase model multiplies the raw draw probability by `exp(drawBias + drawSlope * phase)` and renormalises all three probabilities. Both models minimise multinomial log loss on the same fit positions. Held-out evaluation uses parameters rounded to three decimals.

| Band | Draw bias | Draw slope | Constant factor |
| --- | --- | --- | --- |
| 1800 | 0.529 | 1.385 | 4.001 |
| 2000 | 0.540 | 1.407 | 4.219 |
| 2200 | 0.398 | 1.467 | 3.926 |
| 2400 | -0.665 | 1.627 | 1.532 |
| 2600 | -0.448 | 1.271 | 1.422 |

## Held-out value head

All predictions use the chosen model Elo. Draw rates average predicted draw probabilities across positions. Log loss uses natural logarithms.

| Band | Positions | Observed draw | Raw draw | Phase draw | Constant draw | Raw loss | Phase loss | Constant loss | Phase within 3 pp? | Constant within 3 pp? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | 8,043 | 27.45% | 9.49% | 26.57% | 26.38% | 1.0666 | 0.8984 | 0.9195 | Yes | Yes |
| 2000 | 8,145 | 32.95% | 11.44% | 32.11% | 31.92% | 1.1184 | 0.9207 | 0.9382 | Yes | Yes |
| 2200 | 8,472 | 39.13% | 15.11% | 37.52% | 37.66% | 1.1351 | 0.9245 | 0.9459 | Yes | Yes |
| 2400 | 8,253 | 48.13% | 36.25% | 45.67% | 45.18% | 0.9201 | 0.8812 | 0.8883 | Yes | Yes |
| 2600 | 8,734 | 46.14% | 39.43% | 47.20% | 46.81% | 0.9143 | 0.8879 | 0.9035 | Yes | Yes |

### By phase

| Band | Phase | Positions | Observed draw | Raw draw | Phase draw | Constant draw | Raw loss | Phase loss | Constant loss | Phase within 5 pp? | Constant within 5 pp? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | ≥0.75 | 3,775 | 27.44% | 5.64% | 26.06% | 19.06% | 1.2679 | 1.0225 | 1.0428 | Yes | No |
| 1800 | 0.4–<0.75 | 2,131 | 26.65% | 8.18% | 23.97% | 24.94% | 1.0168 | 0.8609 | 0.8602 | Yes | Yes |
| 1800 | <0.4 | 2,137 | 28.26% | 17.60% | 30.05% | 40.74% | 0.7606 | 0.7164 | 0.7610 | Yes | No |
| 2000 | ≥0.75 | 3,868 | 33.48% | 7.41% | 32.52% | 24.83% | 1.3257 | 1.0369 | 1.0556 | Yes | No |
| 2000 | 0.4–<0.75 | 2,195 | 30.80% | 10.54% | 29.69% | 31.40% | 1.0509 | 0.8905 | 0.8900 | Yes | Yes |
| 2000 | <0.4 | 2,082 | 34.25% | 19.89% | 33.89% | 45.65% | 0.8046 | 0.7364 | 0.7710 | Yes | No |
| 2200 | ≥0.75 | 4,025 | 40.20% | 10.20% | 38.21% | 30.13% | 1.3365 | 1.0204 | 1.0442 | Yes | No |
| 2200 | 0.4–<0.75 | 2,361 | 36.93% | 14.56% | 35.30% | 38.06% | 1.0586 | 0.8963 | 0.8972 | Yes | Yes |
| 2200 | <0.4 | 2,086 | 39.55% | 25.23% | 38.70% | 51.71% | 0.8332 | 0.7716 | 0.8112 | Yes | No |
| 2400 | ≥0.75 | 4,066 | 47.71% | 29.57% | 47.97% | 38.69% | 1.0733 | 0.9970 | 1.0150 | Yes | No |
| 2400 | 0.4–<0.75 | 2,200 | 47.23% | 38.36% | 44.50% | 47.59% | 0.8676 | 0.8473 | 0.8493 | Yes | Yes |
| 2400 | <0.4 | 1,987 | 49.97% | 47.56% | 42.24% | 55.81% | 0.6647 | 0.6818 | 0.6721 | No | No |
| 2600 | ≥0.75 | 3,845 | 45.96% | 30.58% | 46.45% | 38.09% | 1.0671 | 1.0110 | 1.0260 | Yes | No |
| 2600 | 0.4–<0.75 | 2,317 | 44.50% | 39.75% | 46.06% | 47.36% | 0.8663 | 0.8638 | 0.8629 | Yes | Yes |
| 2600 | <0.4 | 2,572 | 47.90% | 52.39% | 49.34% | 59.35% | 0.7290 | 0.7256 | 0.7572 | Yes | No |

### By ply

| Band | Ply | Positions | Observed draw | Raw draw | Phase draw | Constant draw | Raw loss | Phase loss | Constant loss | Phase within 5 pp? | Constant within 5 pp? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | 16–40 | 3,475 | 28.78% | 6.13% | 26.92% | 20.33% | 1.2835 | 1.0310 | 1.0515 | Yes | No |
| 1800 | 41–80 | 3,221 | 26.86% | 9.18% | 24.04% | 26.41% | 0.9908 | 0.8480 | 0.8496 | Yes | Yes |
| 1800 | 81+ | 1,347 | 25.46% | 18.92% | 31.71% | 41.90% | 0.6884 | 0.6767 | 0.7463 | No | No |
| 2000 | 16–40 | 3,468 | 34.89% | 8.03% | 33.74% | 26.40% | 1.3424 | 1.0495 | 1.0674 | Yes | No |
| 2000 | 41–80 | 3,252 | 31.06% | 11.26% | 29.29% | 31.96% | 1.0419 | 0.8817 | 0.8878 | Yes | Yes |
| 2000 | 81+ | 1,425 | 32.56% | 20.16% | 34.56% | 45.27% | 0.7481 | 0.6959 | 0.7387 | Yes | No |
| 2200 | 16–40 | 3,462 | 41.91% | 11.04% | 39.75% | 31.96% | 1.3556 | 1.0337 | 1.0582 | Yes | No |
| 2200 | 41–80 | 3,366 | 37.55% | 14.79% | 34.81% | 37.63% | 1.0728 | 0.8987 | 0.9027 | Yes | Yes |
| 2200 | 81+ | 1,644 | 36.50% | 24.35% | 38.36% | 49.70% | 0.7984 | 0.7478 | 0.7979 | Yes | No |
| 2400 | 16–40 | 3,445 | 50.39% | 31.21% | 49.50% | 40.53% | 1.0818 | 1.0008 | 1.0194 | Yes | No |
| 2400 | 41–80 | 3,287 | 45.09% | 37.02% | 43.09% | 45.95% | 0.8738 | 0.8546 | 0.8582 | Yes | Yes |
| 2400 | 81+ | 1,521 | 49.57% | 46.00% | 42.55% | 54.05% | 0.6541 | 0.6682 | 0.6561 | No | Yes |
| 2600 | 16–40 | 3,474 | 50.98% | 32.52% | 48.07% | 40.24% | 1.0677 | 0.9977 | 1.0161 | Yes | No |
| 2600 | 41–80 | 3,376 | 43.96% | 40.57% | 45.85% | 47.93% | 0.8556 | 0.8599 | 0.8566 | Yes | Yes |
| 2600 | 81+ | 1,884 | 41.14% | 50.15% | 48.01% | 56.92% | 0.7365 | 0.7357 | 0.7802 | No | No |

## Reproduction

```sh
maia_tmp="$(mktemp -d)"
python3 -m venv "$maia_tmp/venv"
"$maia_tmp/venv/bin/pip" install onnxruntime==1.32.0 python-chess==1.999 numpy==2.5.5
"$maia_tmp/venv/bin/python" scripts/maia/calibrate.py --pgn /home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn --model /home/danilo/data/maia/maia3-5m.onnx --seed 1503 --per-band 6000 --out-ts src/engine/maia/classical-calibration.ts --out-report scripts/maia/calibration-report.md
```

CPU execution provider, 8 single-threaded inference workers, batch size 128. Header pass 254.9 s, sample parsing 130.8 s, rating sweep skipped, total 1559.1 s.
