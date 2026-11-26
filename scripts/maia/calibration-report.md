# Maia-3 classical calibration

Run on 2026-11-26 UTC using LumbrasGigabase_OTB_Complete.pgn and CSSLab maia3-5m.onnx.
Seed 1503, requested 6,000 games per band.

The header scan admits games with missing TimeControl if they pass the other filters. Some fast games may therefore remain in the sample. The 2600 band starts at mean Elo 2500.
Ply counts half-moves played before the sampled position. Fit and held-out samples come from disjoint games. Move metrics use up to three uniformly sampled positions per game, with ply ≥ 10. Value metrics use one uniformly sampled position per game with ply ≥ 16. Both stop before the terminal position.

## Sample sizes

| Band | Eligible games | Games fit / held | Move positions fit / held | Value positions fit / held | Unusable PGNs fit / held |
| --- | --- | --- | --- | --- | --- |
| 1800 | 408,123 | 4,800 / 1,200 | 14,395 / 3,598 | 4,779 / 1,191 | 0 / 0 |
| 2000 | 539,771 | 4,800 / 1,200 | 14,389 / 3,598 | 4,763 / 1,194 | 0 / 0 |
| 2200 | 634,212 | 4,800 / 1,200 | 14,385 / 3,599 | 4,766 / 1,193 | 0 / 0 |
| 2400 | 575,899 | 4,800 / 1,200 | 14,380 / 3,598 | 4,737 / 1,191 | 0 / 0 |
| 2600 | 220,925 | 4,800 / 1,200 | 14,386 / 3,598 | 4,767 / 1,193 | 0 / 0 |

## Rating and draw-factor fit

The raw likelihood maxima were already monotone.
Draw factors minimise fit multinomial log loss subject to k ≥ 1. Held-out evaluation uses the factors rounded to three decimals.

| Band | Raw best Elo | Model Elo | Draw factor |
| --- | --- | --- | --- |
| 1800 | 2300 | 2300 | 4.917 |
| 2000 | 2700 | 2700 | 4.109 |
| 2200 | 2900 | 2900 | 1.505 |
| 2400 | 2900 | 2900 | 2.098 |
| 2600 | 2900 | 2900 | 1.868 |

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

## Held-out value head

Raw and calibrated predictions both use the fitted model Elo. Draw rates average the predicted draw probability across positions. Log loss uses natural logarithms.

| Band | Games | Observed draw | Raw draw | Calibrated draw | Raw loss | Calibrated loss | Within 3 pp? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | 1191 | 29.39% | 8.20% | 27.53% | 1.1236 | 0.9165 | Yes |
| 2000 | 1194 | 36.01% | 13.50% | 35.75% | 1.0882 | 0.9103 | Yes |
| 2200 | 1193 | 43.00% | 34.85% | 43.38% | 0.9249 | 0.9088 | Yes |
| 2400 | 1191 | 51.89% | 35.19% | 51.12% | 0.9357 | 0.8701 | Yes |
| 2600 | 1193 | 52.31% | 38.09% | 51.51% | 0.9325 | 0.8852 | Yes |

### By ply

| Band | Ply | Games | Observed draw | Raw draw | Calibrated draw | Raw loss | Calibrated loss |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1800 | 16–40 | 613 | 31.00% | 6.05% | 23.37% | 1.3088 | 1.0243 |
| 1800 | 41–80 | 462 | 27.92% | 8.55% | 28.81% | 0.9834 | 0.8125 |
| 1800 | 81+ | 116 | 26.72% | 18.14% | 44.43% | 0.7033 | 0.7614 |
| 2000 | 16–40 | 549 | 41.35% | 11.09% | 32.61% | 1.3022 | 1.0070 |
| 2000 | 41–80 | 511 | 31.31% | 13.49% | 35.68% | 0.9507 | 0.8396 |
| 2000 | 81+ | 134 | 32.09% | 23.40% | 48.93% | 0.7359 | 0.7840 |
| 2200 | 16–40 | 555 | 47.93% | 31.22% | 40.14% | 1.0580 | 1.0076 |
| 2200 | 41–80 | 478 | 38.91% | 35.73% | 44.09% | 0.8511 | 0.8550 |
| 2200 | 81+ | 160 | 38.12% | 44.81% | 52.52% | 0.6838 | 0.7269 |
| 2400 | 16–40 | 575 | 57.39% | 31.44% | 48.02% | 1.0660 | 0.9336 |
| 2400 | 41–80 | 489 | 46.63% | 37.31% | 52.95% | 0.8554 | 0.8437 |
| 2400 | 81+ | 127 | 47.24% | 44.07% | 58.13% | 0.6550 | 0.6838 |
| 2600 | 16–40 | 553 | 60.22% | 32.80% | 46.83% | 1.0602 | 0.9318 |
| 2600 | 41–80 | 478 | 45.61% | 40.01% | 53.12% | 0.8407 | 0.8465 |
| 2600 | 81+ | 162 | 45.06% | 50.51% | 62.74% | 0.7678 | 0.8405 |

## Held-out move head

| Band | Positions | Top-1 at band Elo | Top-1 at model Elo | Mean log likelihood at band Elo | Mean log likelihood at model Elo |
| --- | --- | --- | --- | --- | --- |
| 1800 | 3598 | 49.83% | 53.06% | -1.5251 | -1.4339 |
| 2000 | 3598 | 51.47% | 54.09% | -1.4956 | -1.3934 |
| 2200 | 3599 | 52.32% | 53.40% | -1.4833 | -1.4045 |
| 2400 | 3598 | 53.00% | 54.59% | -1.4281 | -1.3811 |
| 2600 | 3598 | 55.75% | 55.39% | -1.3573 | -1.3271 |

## Reproduction

```sh
maia_tmp="$(mktemp -d)"
python3 -m venv "$maia_tmp/venv"
"$maia_tmp/venv/bin/pip" install onnxruntime==1.32.0 python-chess==1.999 numpy==2.5.5
"$maia_tmp/venv/bin/python" scripts/maia/calibrate.py --pgn /home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn --model /home/danilo/data/maia/maia3-5m.onnx --seed 1503 --per-band 6000 --out-ts src/engine/maia/classical-calibration.ts --out-report scripts/maia/calibration-report.md
```

CPU execution provider, 8 single-threaded inference workers, batch size 128. Header pass 241.6 s, sample parsing 98.6 s, rating sweep 5696.9 s, total 6387.6 s.
