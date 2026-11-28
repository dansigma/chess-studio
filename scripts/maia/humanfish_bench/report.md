# HumanFish November 2026 Move-Prediction Benchmark (SIG-1531)

Replication of HumanFish's November 2026 prospective move-prediction test set (`2026-11-01` to `2026-11-26`) and evaluation of Maia-3 models (5M ONNX, 5M OTB-v1 fine-tuned ONNX, 23M PyTorch, 79M PyTorch) and Toby 2 Accurate (run unmodified as a UCI engine; Toby © Yosha Iglesias, toby.tribychess.org).

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
- **Games with a partial date (`?`) that could fall in the test window:** 64,338; these were checked by players and moves too
- **Matched test games (players + compatible date + moves):** **0** / 533

## 3. PyTorch vs ONNX Parity Check (Maia-3 5M, Raw FIDE)

- **Positions:** 3196
- **ONNX 5M Top-1:** 53.29% | **PyTorch 5M Top-1:** 53.29% (exact top-1 move agreement: 100.00%)
- **ONNX 5M Mean Log-Prob:** -1.395593 | **PyTorch 5M Mean Log-Prob:** -1.395593 (mean |Δ|: 2.53e-06, max |Δ|: 1.77e-05)

## 4. Model Evaluation (95% Game-Clustered Bootstrap CIs, 1,000 Resamples, Seed 1503)

### Overall (N = 3196 positions, 533 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 53.47% [51.91%, 55.32%] | 82.63% [81.30%, 83.88%] | -1.3634 [-1.4042, -1.3198] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 53.29% [51.59%, 55.10%] | 82.38% [81.00%, 83.76%] | -1.3956 [-1.4390, -1.3474] | -0.19 pp [-1.03, +0.56] | -0.0321 [-0.0413, -0.0227] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 55.29% [53.60%, 57.10%] | 83.92% [82.52%, 85.27%] | -1.2918 [-1.3314, -1.2491] | +1.81 pp [+0.56, +3.00] | +0.0717 [+0.0589, +0.0845] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 56.35% [54.57%, 58.10%] | 84.86% [83.52%, 86.17%] | -1.2786 [-1.3260, -1.2323] | +2.88 pp [+1.53, +4.14] | +0.0848 [+0.0657, +0.1037] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 57.01% [55.22%, 58.73%] | 85.29% [84.01%, 86.60%] | -1.2273 [-1.2734, -1.1798] | +3.54 pp [+2.25, +4.82] | +0.1362 [+0.1156, +0.1552] |
| (f) Toby 2 Accurate (unmodified, RTX 3090) | 67.46% [65.77%, 69.22%] | 92.83% [91.96%, 93.68%] | -0.9395 [-0.9940, -0.8855] | +13.99 pp [+12.30, +15.70] | +0.4239 [+0.3756, +0.4712] |

### Classical (N = 1828 positions, 305 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 53.17% [50.87%, 55.52%] | 81.78% [79.92%, 83.44%] | -1.3710 [-1.4348, -1.3149] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 52.19% [49.95%, 54.43%] | 81.62% [79.68%, 83.37%] | -1.4204 [-1.4904, -1.3584] | -0.98 pp [-2.13, +0.00] | -0.0494 [-0.0627, -0.0368] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 55.85% [53.61%, 58.15%] | 83.42% [81.62%, 85.01%] | -1.2950 [-1.3523, -1.2386] | +2.68 pp [+1.26, +4.27] | +0.0760 [+0.0612, +0.0921] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 55.36% [52.95%, 57.54%] | 83.75% [81.97%, 85.36%] | -1.3174 [-1.3866, -1.2583] | +2.19 pp [+0.55, +3.83] | +0.0536 [+0.0295, +0.0791] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 56.07% [53.66%, 58.48%] | 84.74% [82.97%, 86.34%] | -1.2676 [-1.3327, -1.2058] | +2.90 pp [+1.10, +4.75] | +0.1034 [+0.0786, +0.1318] |
| (f) Toby 2 Accurate (unmodified, RTX 3090) | 68.44% [66.28%, 70.49%] | 93.44% [92.40%, 94.53%] | -0.9075 [-0.9788, -0.8426] | +15.26 pp [+13.13, +17.58] | +0.4635 [+0.4040, +0.5248] |

### Rapid (N = 648 positions, 108 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 51.23% [46.91%, 55.40%] | 82.41% [79.32%, 85.34%] | -1.4092 [-1.5204, -1.3009] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 52.01% [47.69%, 56.17%] | 82.10% [78.70%, 85.34%] | -1.4255 [-1.5418, -1.3127] | +0.77 pp [-1.23, +2.78] | -0.0162 [-0.0337, +0.0020] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 52.93% [48.77%, 57.25%] | 83.18% [79.78%, 86.57%] | -1.3321 [-1.4303, -1.2372] | +1.70 pp [-0.77, +4.17] | +0.0771 [+0.0512, +0.1068] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 54.17% [50.31%, 58.02%] | 85.80% [82.56%, 88.73%] | -1.2789 [-1.3837, -1.1797] | +2.93 pp [+0.00, +5.86] | +0.1304 [+0.0823, +0.1842] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 54.17% [50.00%, 58.49%] | 85.03% [81.94%, 87.81%] | -1.2386 [-1.3377, -1.1434] | +2.93 pp [+0.31, +5.71] | +0.1707 [+0.1265, +0.2193] |
| (f) Toby 2 Accurate (unmodified, RTX 3090) | 64.35% [60.65%, 67.90%] | 92.59% [90.74%, 94.44%] | -0.9347 [-1.0305, -0.8517] | +13.12 pp [+8.79, +17.13] | +0.4745 [+0.3792, +0.5680] |

### Blitz (N = 720 positions, 120 games)

| Model | Top-1 [95% CI] | Top-3 [95% CI] | Mean Log-Prob [95% CI] | Δ Top-1 vs (a) | Δ Log-Prob vs (a) |
| --- | --- | --- | --- | --- | --- |
| (a) Maia-3 5M ONNX (Classical 2900) | 56.25% [53.19%, 59.17%] | 85.00% [82.64%, 87.22%] | -1.3031 [-1.3817, -1.2269] | — | — |
| (b) Maia-3 5M ONNX (Raw FIDE) | 57.22% [54.03%, 60.28%] | 84.58% [82.08%, 87.08%] | -1.3056 [-1.3909, -1.2259] | +0.97 pp [-0.56, +2.50] | -0.0025 [-0.0202, +0.0149] |
| (c) Maia-3 5M Finetuned OTB-v1 ONNX (Raw FIDE) | 55.97% [51.94%, 59.58%] | 85.83% [83.33%, 88.06%] | -1.2473 [-1.3263, -1.1711] | -0.28 pp [-2.78, +2.36] | +0.0558 [+0.0275, +0.0865] |
| (d) Maia-3 23M PyTorch GPU (Raw FIDE) | 60.83% [57.50%, 64.17%] | 86.81% [84.44%, 89.03%] | -1.1800 [-1.2660, -1.1019] | +4.58 pp [+1.94, +7.08] | +0.1231 [+0.0890, +0.1572] |
| (e) Maia-3 79M PyTorch GPU (Raw FIDE) | 61.94% [58.61%, 65.69%] | 86.94% [84.44%, 89.17%] | -1.1147 [-1.1990, -1.0369] | +5.69 pp [+2.92, +8.61] | +0.1884 [+0.1461, +0.2299] |
| (f) Toby 2 Accurate (unmodified, RTX 3090) | 67.78% [64.31%, 71.11%] | 91.53% [89.44%, 93.34%] | -1.0250 [-1.1513, -0.9145] | +11.53 pp [+8.19, +15.00] | +0.2780 [+0.1742, +0.3838] |

## 5. Published Numbers vs Ours

| Model / System | Published Top-1 | Published Top-3 | Our Top-1 (All) | Our Top-3 (All) | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| HumanFish (Nov 2026, N=2,698) | 65.9% | — | — | — | Published on humanfish.vercel.app |
| DSC-150M (Nov 2026, N=2,698) | 63.0% | — | — | — | Published on humanfish.vercel.app |
| Toby 2 Accurate (Nov 2026, N=3,136) | 67.5% | 92.6% | 67.46% | 92.83% | Published: 523 games, 12/13 tournaments; ours: run unmodified on the same positions |
| Maia-3 79M (Raw FIDE) | 57.2% | — | 57.01% | 85.29% | Published: 5-fold tournament-recalibrated on N=2,698 |
| Maia-3 23M (Raw FIDE) | 55.6% | — | 56.35% | 84.86% | Published: 5-fold tournament-recalibrated on N=2,698 |
| Maia-3 5M ONNX (Classical 2900) | — | — | 53.47% | 82.63% | Both FIDE ratings mapped via classical-calibration.ts |
| Maia-3 5M ONNX (Raw FIDE) | — | — | 53.29% | 82.38% | Uncalibrated FIDE |
| Maia-3 5M Finetuned OTB-v1 ONNX | — | — | 55.29% | 83.92% | Fine-tuned on LumbrasGigabase OTB |

## 6. Methodological Differences & Caveats

- **Tournament coverage:** All 13 tournaments from `prospective_nov2026_report.json` were found and downloaded via the Lichess broadcast API (whereas Toby 2 reported 12/13). Our dataset has 533 games / 3,196 positions vs HumanFish's 450 games / 2,698 positions and Toby 2's 523 games / 3,136 positions.
- **Sampling seed:** We sampled 1 ply uniformly from each of 6 equal buckets over `[12, total_plies - 1]` with deterministic seed `1503`; HumanFish's exact random seed and exact start ply (`after move 6` = ply 12) may differ slightly in bucket boundaries. A game shorter than 18 plies has fewer than 6 plies to sample, so it contributes fewer positions (one game here gives 4).
- **Time-control classification:** Lichess broadcast `fideTC` metadata mislabeled `Total Chess World Championship Tour Pilot 2026 | Finals` as `standard` (despite containing `180+2`, `900+10`, `600`, and `2700+30` games) and `WR Women's Chess Tour 2026 - Grand Final | Rapid` as `blitz`. We therefore inferred `time_control_class` primarily from the PGN `TimeControl` tag, falling back to the initial `%clk` timestamp when `TimeControl` is `?`, and finally to tournament name / `fideTC`.
- **Classical mapping for (a):** `classical-calibration.ts` maps FIDE bands `2400` and `2600+` to `2900`. As on the site, we applied this mapping to both players and passed the mapped rating as `self_elo` and `oppo_elo`.
- **Confidence intervals:** We used game-clustered bootstrap (1,000 resamples, seed `1503`); HumanFish also noted that tournament-clustered intervals are wider than game-clustered intervals.
- **Toby 2:** run unmodified as a UCI engine (Linux full release 2.0, `Toby 2 Product = Accurate`, FIDE ratings, time control, base time/increment and game clocks from the PGN, `MultiPV 500`). Probabilities are Toby's listed moves; a played move it does not list (10 of 3,196 positions) gets the `1e-9` floor, which only affects log-prob. A first run under systemd fell back silently to `Standard` because the GPU tools were not on `PATH`; on the same positions Standard scored 67.43% top-1 / 92.68% top-3, almost the same as Accurate. The runner now aborts on that fallback.

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

# 5b. Toby 2 Accurate on the desktop GPU (see TOBY.md), then convert its output
# ~/toby/bench/run_toby_systemd.sh ~/toby/bench/nov2026/positions.jsonl ~/toby/bench/nov2026/toby_predictions.jsonl
# copy toby_predictions.jsonl to /home/danilo/data/maia/humanfish-nov2026/toby_raw.jsonl, then:
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/convert_toby.py

# 6. Compute bootstrap CIs and generate report.md
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/analyze_results.py

# 7. Run self-tests
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/humanfish_bench/test_humanfish_bench.py
```
