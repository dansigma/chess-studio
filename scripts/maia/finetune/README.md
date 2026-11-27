# Maia-3 5M Classical OTB Fine-Tuning (SIG-1523)

Prototype pipeline for fine-tuning Maia-3 5M on classical OTB games (2010+, Elo gap <= 150, both ratings in `[1600, 2900]`) while holding out the SIG-1518 evaluation events (`seed=1503`, `20k` games/band).

## Design Choices

- **Loss**: `CE(policy) + lambda_value * CE(value)` with `lambda_value = 1.0` by default.
- **Policy loss**: plain cross-entropy over the 4352-move vocabulary without illegal-move masking during training.
- **Value order**: `[0: loss, 1: draw, 2: win]` for the side to move, matching `maia3.uci.wdl_from_value_logits` and `src/engine/maia/inference.ts`.
- **Shard storage**: compact uint8 boards (64 bytes, absolute orientation) + `stm`, `move_idx`, `result`, `self_elo`, `oppo_elo`, `game_id`, `ply`. History of 8 boards is reconstructed on the fly in the DataLoader and expanded to `(B, 64, 97)` on GPU.

## Desktop Setup

Sync `scripts/maia` and `src/engine/maia/fixtures` to `~/maia-ft/repo` on the GPU box:

```bash
tar c scripts/maia src/engine/maia/fixtures | ssh Danilo@desktop 'wsl -d Ubuntu -- bash -lc "mkdir -p ~/maia-ft/repo && tar x -C ~/maia-ft/repo"'
```

Ensure `onnx` and `onnxruntime` are installed in `~/maia-ft/.venv`:

```bash
uv pip install --python ~/maia-ft/.venv/bin/python onnx onnxruntime
```

## 1. Self-Checks

```bash
~/maia-ft/.venv/bin/python ~/maia-ft/repo/scripts/maia/finetune/test_finetune.py
```

## 2. Data Preparation

Outputs go to `~/maia-ft/data/shards` (`train/`, `val/`, `test_events.json`, `meta.json`). Expected runtime on 24 cores for the full 12 GB Lumbra PGN: ~15–25 minutes.

```bash
~/maia-ft/.venv/bin/python ~/maia-ft/repo/scripts/maia/finetune/prepare_data.py \
  --pgn ~/maia-ft/data/LumbrasGigabase_OTB_Complete.pgn \
  --out-dir ~/maia-ft/data/shards \
  --workers 24
```

## 3. LR Sweep & Training

Outputs go to `~/maia-ft/runs/<name>/` (`config.json`, `metrics.jsonl`, `best.pt`, `last.pt`, `step_*.pt`). At `batch-size 2048` with `bf16` autocast on RTX 3090 (~7k+ pos/s), 10k steps takes ~45–50 minutes; 50k steps takes ~4 hours.

Short LR sweep (e.g. 2,000 steps each):

```bash
for lr in 1e-5 3e-5 1e-4; do
  ~/maia-ft/.venv/bin/python ~/maia-ft/repo/scripts/maia/finetune/train.py \
    --data-dir ~/maia-ft/data/shards \
    --out-dir ~/maia-ft/runs/sweep-lr-$lr \
    --lr $lr \
    --max-steps 2000 \
    --warmup-steps 200 \
    --eval-every 500 \
    --save-every 2000
done
```

Full training run (example with `--lr 3e-5`):

```bash
~/maia-ft/.venv/bin/python ~/maia-ft/repo/scripts/maia/finetune/train.py \
  --data-dir ~/maia-ft/data/shards \
  --out-dir ~/maia-ft/runs/maia3-5m-otb-v1 \
  --lr 3e-5 \
  --batch-size 2048 \
  --max-steps 50000 \
  --warmup-steps 500 \
  --eval-every 500 \
  --save-every 2000 \
  --patience 10
```

Resume from a checkpoint:

```bash
~/maia-ft/.venv/bin/python ~/maia-ft/repo/scripts/maia/finetune/train.py \
  --data-dir ~/maia-ft/data/shards \
  --out-dir ~/maia-ft/runs/maia3-5m-otb-v1 \
  --resume ~/maia-ft/runs/maia3-5m-otb-v1/last.pt
```

## 4. ONNX Export & Parity Check

```bash
~/maia-ft/.venv/bin/python ~/maia-ft/repo/scripts/maia/finetune/export_finetuned.py \
  ~/maia-ft/runs/maia3-5m-otb-v1/maia3-5m-otb-v1.onnx \
  --checkpoint ~/maia-ft/runs/maia3-5m-otb-v1/best.pt \
  --fixtures ~/maia-ft/repo/src/engine/maia/fixtures/encoder.json
```

## 5. Held-Out Evaluation (SIG-1518)

Policy move-match evaluation at real FIDE ratings vs base model with mapped ratings:

```bash
# Fine-tuned at real FIDE rating
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/move_match.py \
  --pgn /home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn \
  --model /path/to/maia3-5m-otb-v1.onnx \
  --elo-mode fide \
  --out-report scripts/maia/move-match-finetuned.md

# Combined value + policy summary (no Stockfish required)
/home/danilo/data/maia/venv-calib/bin/python scripts/maia/finetune/evaluate_finetuned.py \
  --pgn /home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn \
  --model /path/to/maia3-5m-otb-v1.onnx \
  --elo-mode fide \
  --out-report scripts/maia/finetune/eval-finetuned.md
```
