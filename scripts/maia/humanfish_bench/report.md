# HumanFish November 2026 Move-Prediction Benchmark (SIG-1531)

Replication of HumanFish's November 2026 prospective move-prediction test set (`2026-11-01` to `2026-11-26`) and evaluation of Maia-3 models (5M ONNX, 5M OTB-v1 fine-tuned ONNX, 23M PyTorch, 79M PyTorch).

## 1. Dataset & Filtering Summary

- **Tournaments downloaded:** 13/13 (missing: none)
- **Raw PGN games:** 1254
- **Kept games / sampled positions:** **533 games / 3196 positions** (seed `1503`)
- **Published references:** HumanFish reported 450 games / 2,698 positions (13 tournaments); Toby 2 reported 523 games / 3,136 positions (12/13 tournaments).
- **Filter drops:**
  - `elo_out_of_range`: 559
  - `date_out_of_range`: 132
  - `too_short_lt_16_plies`: 22
  - `clocks_lt_60pct`: 1
  - `no_clocks`: 6
  - `variant_or_engine`: 1
- **Positions per time-control class:**
  - `classical`: 1828 (57.2%)
  - `rapid`: 648 (20.3%)
  - `blitz`: 720 (22.5%)

### Games & Positions per Tournament

| Tournament | ID | Raw Games | Kept Games | Sampled Positions |
| --- | --- | ---: | ---: | ---: |
| 1. Bundesliga Austria 2026/2027 | `IjDgZVUR` | 117 | 28 | 168 |
| 17th Hainan Danzhou GM Tournament 2026 | Blitz | `AF2Siwo3` | 28 | 28 | 168 |
| 2026 Chinese Chess League Division A | Finals | `TemMv6c8` | 110 | 39 | 232 |
| 35. ekipno prvenstvo Hrvatske 2026 (Croatian Team Championship) - 1. A HŠL | `EkpniHMl` | 212 | 63 | 378 |
| Campeonato de España por Equipos de Club División de Honor | `zVXx5cjN` | 168 | 133 | 798 |
| FIDE World Chess Championship 2026 | `qfkdt8mn` | 14 | 3 | 18 |
| FIDE World Junior Chess Championship 2026 | Open | `wYvYFVtt` | 319 | 10 | 60 |
| Jerusalem Masters 2026 | Round Robin | `RsBzGk3P` | 66 | 55 | 330 |
| Jerusalem Masters 2026 | Semifinal | `gGbPFM7r` | 7 | 2 | 12 |
| Ladder Legends by Lichess | GM Peng vs GM Salgado López | `IckNcjqS` | 1 | 1 | 6 |
| London Chess Classic 2026: Masters | `wCiCBmw1` | 21 | 10 | 60 |
| Total Chess World Championship Tour Pilot 2026 | Finals | `6PTzCQFL` | 174 | 158 | 948 |
| WR Women's Chess Tour 2026 - Grand Final | Rapid | `OehM51v0` | 17 | 3 | 18 |

## 2. Contamination Check (`LumbrasGigabase_OTB_Complete.pgn`)

- **Total games scanned:** 13,450,696
- **Max valid `YYYY.MM.DD` date in PGN:** `2026.10.27` (games with `Date >= 2026.11`: 0)
- **Matched test games (players + date + moves):** **0** / 533

## 3. PyTorch vs ONNX Parity Check (Maia-3 5M, Raw FIDE)

- **Positions:** 3196
- **ONNX 5M Top-1:** 53.29% | **PyTorch 5M Top-1:** 53.29% (exact top-1 move agreement: 100.00%)
- **ONNX 5M Mean Log-Prob:** -1.395593 | **PyTorch 5M Mean Log-Prob:** -1.395593 (mean |Δ|: 2.53e-06, max |Δ|: 1.77e-05)

## 4. Model Evaluation (95% Game-Clustered Bootstrap CIs, 1,000 Resamples, Seed 1503)

### Overall (N = 3196 positions, 533 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 53.22% [51.50%, 55.00%] | 82.48% [81.05%, 83.81%] | -1.3711 [-1.4128, -1.3262] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 53.29% [51.59%, 55.10%] | 82.38% [81.00%, 83.76%] | -1.3956 [-1.4390, -1.3474] | +0.06 pp [-0.66, +0.78] | -0.0245 [-0.0308, -0.0176] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 55.29% [53.60%, 57.10%] | 83.92% [82.52%, 85.27%] | -1.2918 [-1.3314, -1.2491] | +2.07 pp [+0.88, +3.25] | +0.0794 [+0.0652, +0.0943] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 56.35% [54.57%, 58.10%] | 84.86% [83.52%, 86.17%] | -1.2786 [-1.3260, -1.2323] | +3.13 pp [+1.91, +4.32] | +0.0925 [+0.0742, +0.1112] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 57.01% [55.22%, 58.73%] | 85.29% [84.01%, 86.60%] | -1.2273 [-1.2734, -1.1798] | +3.79 pp [+2.57, +5.07] | +0.1439 [+0.1232, +0.1637] |

### Classical (N = 1828 positions, 305 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 52.68% [50.33%, 55.03%] | 81.95% [80.01%, 83.55%] | -1.3843 [-1.4493, -1.3270] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 52.19% [49.95%, 54.43%] | 81.62% [79.68%, 83.37%] | -1.4204 [-1.4904, -1.3584] | -0.49 pp [-1.42, +0.44] | -0.0362 [-0.0460, -0.0267] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 55.85% [53.61%, 58.15%] | 83.42% [81.62%, 85.01%] | -1.2950 [-1.3523, -1.2386] | +3.17 pp [+1.64, +4.65] | +0.0893 [+0.0718, +0.1069] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 55.36% [52.95%, 57.54%] | 83.75% [81.97%, 85.36%] | -1.3174 [-1.3866, -1.2583] | +2.68 pp [+0.99, +4.27] | +0.0669 [+0.0432, +0.0911] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 56.07% [53.66%, 58.48%] | 84.74% [82.97%, 86.34%] | -1.2676 [-1.3327, -1.2058] | +3.39 pp [+1.75, +5.03] | +0.1167 [+0.0919, +0.1440] |

### Rapid (N = 648 positions, 108 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 51.08% [47.07%, 55.09%] | 82.10% [79.01%, 85.03%] | -1.4102 [-1.5270, -1.2968] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 52.01% [47.69%, 56.17%] | 82.10% [78.70%, 85.34%] | -1.4255 [-1.5418, -1.3127] | +0.93 pp [-0.62, +2.47] | -0.0153 [-0.0270, -0.0023] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 52.93% [48.77%, 57.25%] | 83.18% [79.78%, 86.57%] | -1.3321 [-1.4303, -1.2372] | +1.85 pp [-0.46, +4.01] | +0.0781 [+0.0483, +0.1088] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 54.17% [50.31%, 58.02%] | 85.80% [82.56%, 88.73%] | -1.2789 [-1.3837, -1.1797] | +3.09 pp [+0.46, +5.56] | +0.1313 [+0.0847, +0.1856] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 54.17% [50.00%, 58.49%] | 85.03% [81.94%, 87.81%] | -1.2386 [-1.3377, -1.1434] | +3.09 pp [+0.46, +5.71] | +0.1716 [+0.1247, +0.2207] |

### Blitz (N = 720 positions, 120 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 56.53% [53.33%, 59.44%] | 84.17% [81.53%, 86.67%] | -1.3026 [-1.3839, -1.2247] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 57.22% [54.03%, 60.28%] | 84.58% [82.08%, 87.08%] | -1.3056 [-1.3909, -1.2259] | +0.69 pp [-0.56, +2.08] | -0.0030 [-0.0155, +0.0093] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 55.97% [51.94%, 59.58%] | 85.83% [83.33%, 88.06%] | -1.2473 [-1.3263, -1.1711] | -0.56 pp [-3.33, +2.22] | +0.0553 [+0.0233, +0.0902] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 60.83% [57.50%, 64.17%] | 86.81% [84.44%, 89.03%] | -1.1800 [-1.2660, -1.1019] | +4.31 pp [+1.52, +6.81] | +0.1226 [+0.0877, +0.1599] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 61.94% [58.61%, 65.69%] | 86.94% [84.44%, 89.17%] | -1.1147 [-1.1990, -1.0369] | +5.42 pp [+2.64, +8.33] | +0.1879 [+0.1468, +0.2311] |

## 5. Published Numbers vs Ours

| Model / System | Published Top-1 | Published Top-3 | Our Top-1 (All) | Our Top-3 (All) | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| HumanFish (Nov 2026, N=2,698) | 65.9% | — | — | — | Published on humanfish.vercel.app |
| DSC-150M (Nov 2026, N=2,698) | 63.0% | — | — | — | Published on humanfish.vercel.app |
| Toby 2 (Nov 2026, N=3,136) | 67.5% | 92.6% | — | — | 523 games, 12/13 tournaments |
| Maia-3 79M (Raw FIDE) | 57.2% | — | 57.01% | 85.29% | Published: 5-fold tournament-recalibrated on N=2,698 |
| Maia-3 23M (Raw FIDE) | 55.6% | — | 56.35% | 84.86% | Published: 5-fold tournament-recalibrated on N=2,698 |
| Maia-3 5M ONNX (Classical 2900) | — | — | 53.22% | 82.48% | Mover FIDE mapped via classical-calibration.ts |
| Maia-3 5M ONNX (Raw FIDE) | — | — | 53.29% | 82.38% | Uncalibrated FIDE |
| Maia-3 5M Finetuned OTB-v1 ONNX | — | — | 55.29% | 83.92% | Fine-tuned on LumbrasGigabase OTB |

## 6. Methodological Differences & Caveats

- **Tournament coverage:** All 13 tournaments from `prospective_nov2026_report.json` were found and downloaded via the Lichess broadcast API (whereas Toby 2 reported 12/13). Our dataset has 533 games / 3,196 positions vs HumanFish's 450 games / 2,698 positions and Toby 2's 523 games / 3,136 positions.
- **Sampling seed:** We sampled 1 ply uniformly from each of 6 equal buckets over `[12, total_plies - 1]` with deterministic seed `1503`; HumanFish's exact random seed and exact start ply (`after move 6` = ply 12) may differ slightly in bucket boundaries.
- **Time-control classification:** Lichess broadcast `fideTC` metadata mislabeled `Total Chess World Championship Tour Pilot 2026 | Finals` as `standard` (despite containing `180+2`, `900+10`, `600`, and `2700+30` games) and `WR Women's Chess Tour 2026 - Grand Final | Rapid` as `blitz`. We therefore inferred `time_control_class` primarily from the PGN `TimeControl` tag, falling back to the initial `%clk` timestamp when `TimeControl` is `?`, and finally to tournament name / `fideTC`.
- **Classical mapping for (a):** `classical-calibration.ts` maps FIDE bands `2400` and `2600+` to `2900`. We applied this mapping to `self_elo` (the mover's FIDE rating) and passed the opponent's raw FIDE rating as `oppo_elo`.
- **Confidence intervals:** We used game-clustered bootstrap (1,000 resamples, seed `1503`); HumanFish also noted that tournament-clustered intervals are wider than game-clustered intervals.

## 7. Reproduction Commands

```bash
# 1. Download Lichess broadcast PGNs
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/download_tournaments.py

# 2. Build positions.jsonl (seed 1503)
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/build_positions.py

# 3. Check contamination in LumbrasGigabase_OTB_Complete.pgn
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/check_contamination.py

# 4. Evaluate ONNX models (a)-(c) on VM CPU
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/eval_onnx.py

# 5. Evaluate PyTorch models (5m parity, 23m, 79m) on desktop GPU
# ~/maia-ft/.venv/bin/python ~/humanfish-nov2026/eval_pytorch.py --model maia3-5m --positions ~/humanfish-nov2026/positions.jsonl --out ~/humanfish-nov2026/preds/maia3-5m.jsonl
# ~/maia-ft/.venv/bin/python ~/humanfish-nov2026/eval_pytorch.py --model maia3-23m --positions ~/humanfish-nov2026/positions.jsonl --out ~/humanfish-nov2026/preds/maia3-23m.jsonl
# ~/maia-ft/.venv/bin/python ~/humanfish-nov2026/eval_pytorch.py --model maia3-79m --positions ~/humanfish-nov2026/positions.jsonl --out ~/humanfish-nov2026/preds/maia3-79m.jsonl

# 6. Compute bootstrap CIs and generate report.md
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/analyze_results.py

# 7. Run self-tests
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/test_humanfish_bench.py
```
