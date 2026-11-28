# SIG-1523: Maia-3 5M fine-tuned on classical OTB games

Run on 2026-11-27/28 on the RTX 3090 desktop (WSL Ubuntu 24.04, torch 2.11 + CUDA 12.8).
Evaluation on the VM with ONNX Runtime (CPU).

## Training

- Base: CSSLab `maia3-5m.pt` (HF `UofTCSSLab/Maia3-5M`).
- Data: `LumbrasGigabase_OTB_Complete.pgn` (sha256 prefix `87fde5bc`). Classical games from 2010 on, both ratings in `[1600, 2900]`, rating gap ≤ 150.
  - Every event in the SIG-1518 held-out set (seed 1503, 20k games/band) is excluded from training and validation.
  - 143,748,893 train positions and 2,911,568 validation positions, split by event. Data prep took 1,767 s.
- Loss: masked policy CE (legal moves only) + value CE (weight 1.0). AdamW, bf16 autocast, batch 2048, gradient clip.
- Schedule: 1,000 warmup steps, then cosine decay.
- LR sweep (2,000 steps each, validation loss / top-1):

  | LR | Val loss | Val top-1 |
  | --- | --- | --- |
  | 1e-5 | 2.1614 | 55.7% |
  | **3e-5** | **2.1577** | **55.8%** |
  | 1e-4 | 2.1586 | 55.7% |

  3e-5 was chosen.
- Main run: 70,000 steps (one pass, ~143M positions) at ~6.5k positions/s, about 7 h.
  - Validation loss improved until the final step. Early stopping (patience 6) never triggered.

| Step | Val loss | Policy CE | Value CE | Top-1 |
| --- | --- | --- | --- | --- |
| 0 (base) | 2.6479 | 1.3939 | 1.2540 | 53.07% |
| 10,000 | 2.1503 | 1.2885 | 0.8619 | 55.79% |
| 30,000 | 2.1303 | 1.2743 | 0.8560 | 56.16% |
| 50,000 | 2.1220 | 1.2655 | 0.8566 | 56.41% |
| 70,000 (best) | 2.1157 | 1.2611 | 0.8546 | 56.57% |

Export: `best.pt` → `maia3-5m-otb-v1.onnx` (21.1 MB, sha256 `78af277b…2303165`). The ONNX input and output names are the same as the base model. Parity against the 10 encoder fixtures: max |PT − ONNX| = 3.05e-5.

## Held-out evaluation (SIG-1518 events, ~11.5k positions per band)

The fine-tuned model gets the band's own FIDE rating as `self_elo`/`oppo_elo`. The base model uses the current classical mapping (`2300 / 2500 / 2700 / 2900 / 2900`).

### Move prediction (`move-match-finetuned.md`, base from `../move-match-report.md`)

| Band | Base top-1 | Fine-tuned top-1 | Base log-prob | Fine-tuned log-prob | Gain |
| --- | --- | --- | --- | --- | --- |
| 1800 | 53.37% | **55.02%** | -1.4153 | **-1.3448** | +0.071 |
| 2000 | 52.85% | **54.18%** | -1.4185 | **-1.3522** | +0.066 |
| 2200 | 52.15% | **54.01%** | -1.4450 | **-1.3661** | +0.079 |
| 2400 | 51.08% | **53.18%** | -1.4583 | **-1.3791** | +0.079 |
| 2600 | 52.36% | **54.50%** | -1.4042 | **-1.3301** | +0.074 |

- Each band's 95% event-bootstrap CIs are about ±0.025 nats wide, and the two sets of intervals do not overlap.
- The gain is 3–4× the practical threshold used in SIG-1519 (0.02 nats).
- Top-3 also improves by 1.0–1.8 pp.
- The raw FIDE rating is the best model rating in every band. None of the neighbouring ratings gains anything (the 2600 band ties with 2400). So the fine-tuned model needs **no rating mapping** for moves.

### Result prediction (`eval-finetuned.md`, `eval-base-mapped.md`, `../combined-report.md`)

Value log loss on White/Draw/Black (lower is better):

| Band | Base raw (mapped) | Base + current calibration (b) | **Fine-tuned raw** | Combined with Stockfish d16 (d) |
| --- | --- | --- | --- | --- |
| 1800 | 1.0604 | 0.9082 | **0.8545** | 0.8404 |
| 2000 | 1.0962 | 0.9295 | **0.8727** | 0.8488 |
| 2200 | 1.1660 | 0.9361 | **0.8772** | 0.8377 |
| 2400 | 0.9359 | 0.8894 | **0.8314** | 0.7868 |
| 2600 | 0.9212 | 0.8988 | **0.8464** | 0.8000 |

Draw rate and calibration:

| Band | Observed draw | Base raw draw | Fine-tuned draw | Fine-tuned ECE | Base raw ECE |
| --- | --- | --- | --- | --- | --- |
| 1800 | 26.84% | 9.42% | 27.68% | 0.012 | 0.126 |
| 2000 | 31.18% | 11.49% | 34.24% | 0.022 | 0.138 |
| 2200 | 40.01% | 15.05% | 43.87% | 0.028 | 0.170 |
| 2400 | 47.11% | 36.72% | 52.02% | 0.033 | 0.081 |
| 2600 | 46.41% | 39.22% | 50.35% | 0.030 | 0.056 |

- Without any calibration, the fine-tuned model beats the current Maia-only calibrated bar by 0.05–0.06 nats in every band.
- Fine-tuning fixes the base model's draw blindness.
- It still over-predicts draws by 3.1–4.9 pp from 2000 up. That is outside the 3 pp target used in SIG-1518.
- Combining with Stockfish (SIG-1518) is still better by 0.014–0.045 nats. The gap is largest at 2200+.
- Caveat: `evaluate_finetuned.py` reports point estimates only, without bootstrap CIs. The fine-tuned vs (b) gap is 4–5× the half-width of (b)'s CI in `combined-report.md`. The gap to (d) at 1800 (0.014) is within noise.

## Recommendation

1. **Moves:** the fine-tuned model is clearly better. It also removes the classical rating mapping: the model gets the FIDE rating directly.
2. **Result bar:** the raw fine-tuned model already beats today's Maia-only calibration. It still slightly over-predicts draws at 2000+, and the Stockfish combination remains the best option when an eval exists.
   - If the fine-tuned model ships, re-fit both `classical-calibration.ts` and `classical-combined.ts` on its outputs instead of the base model's.
   - Those fits would likely beat both columns above. The current coefficients were fitted for the base model's draw-blind output and do not apply to the new model.
3. **Not done yet:**
   - Forgetting check on Lichess/online games. No Lichess sample exists locally. Online mode would keep the base model unless this is measured.
   - AGPL obligations for shipping derived weights on the site (attribution and source offer).

## Reproduction

```sh
# GPU box (see README.md for setup)
~/maia-ft/run_prep.sh; ~/maia-ft/run_train.sh
~/maia-ft/.venv/bin/python ~/maia-ft/repo/scripts/maia/finetune/export_finetuned.py \
  ~/maia-ft/runs/maia3-5m-otb-v1/maia3-5m-otb-v1.onnx \
  --checkpoint ~/maia-ft/runs/maia3-5m-otb-v1/best.pt \
  --fixtures ~/maia-ft/repo/src/engine/maia/fixtures/encoder.json

# VM
PGN=/home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn
FT=/home/danilo/data/maia/finetuned/maia3-5m-otb-v1.onnx
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/move_match.py --pgn $PGN --model $FT \
  --elo-mode fide --out-report scripts/maia/move-match-finetuned.md
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/finetune/evaluate_finetuned.py --pgn $PGN \
  --model $FT --elo-mode fide --out-report scripts/maia/finetune/eval-finetuned.md
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/finetune/evaluate_finetuned.py --pgn $PGN \
  --model /home/danilo/data/maia/maia3-5m.onnx --elo-mode mapped \
  --out-report scripts/maia/finetune/eval-base-mapped.md
```
