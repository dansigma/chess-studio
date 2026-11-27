"""Fine-tune Maia-3 5M on sharded classical OTB positions (RTX 3090, bf16)."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import math
from pathlib import Path
import random
import sys
from time import monotonic

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, Sampler

from maia3.model_registry import resolve_checkpoint_path, resolve_model_spec
from maia3.models import MAIA3Model
from maia3.uci import parse_args as parse_maia_args

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR))
from encoding import HISTORY, boards_to_tokens_torch  # noqa: E402


@dataclass
class ShardHandle:
    boards: np.ndarray
    stm: np.ndarray
    move_idx: np.ndarray
    result: np.ndarray
    self_elo: np.ndarray
    oppo_elo: np.ndarray
    ply: np.ndarray
    length: int


def load_shards(split_dir: Path) -> list[ShardHandle]:
    shard_dirs = sorted(p for p in split_dir.iterdir() if p.is_dir() and p.name.startswith("shard_"))
    if not shard_dirs:
        raise FileNotFoundError(f"No shard_* directories found in {split_dir}")
    shards: list[ShardHandle] = []
    for sdir in shard_dirs:
        boards = np.load(sdir / "boards.npy", mmap_mode="r")
        shards.append(
            ShardHandle(
                boards=boards,
                stm=np.load(sdir / "stm.npy", mmap_mode="r"),
                move_idx=np.load(sdir / "move_idx.npy", mmap_mode="r"),
                result=np.load(sdir / "result.npy", mmap_mode="r"),
                self_elo=np.load(sdir / "self_elo.npy", mmap_mode="r"),
                oppo_elo=np.load(sdir / "oppo_elo.npy", mmap_mode="r"),
                ply=np.load(sdir / "ply.npy", mmap_mode="r"),
                length=len(boards),
            )
        )
    return shards


class ShardedBoardBatchDataset(Dataset):
    """Fetch whole batches of (hist_boards, hist_stm, self_elo, oppo_elo, move_y, value_y).

    Using a batch-level __getitem__ avoids 2048x Python per-item call overhead and
    transfers compact uint8 (B, 8, 64) boards to GPU before expanding to (B, 64, 97).
    """

    def __init__(self, split_dir: Path):
        self.shards = load_shards(split_dir)
        self.total_positions = sum(s.length for s in self.shards)
        self._hist_offsets = np.arange(HISTORY, dtype=np.int64)[None, :]  # (1, 8)
        self._back = (HISTORY - 1) - self._hist_offsets  # [7, 6, ..., 0]

    def __len__(self) -> int:
        return self.total_positions

    def __getitem__(self, batch_spec: tuple[int, np.ndarray]):
        shard_idx, idx = batch_spec
        shard = self.shards[shard_idx]
        plies = shard.ply[idx].astype(np.int64)[:, None]
        hist_idx = idx[:, None] - np.minimum(plies, self._back)

        hist_boards = np.array(shard.boards[hist_idx], dtype=np.uint8, copy=True)
        hist_stm = np.array(shard.stm[hist_idx], dtype=np.uint8, copy=True)
        self_elo = np.array(shard.self_elo[idx], dtype=np.int64, copy=True)
        oppo_elo = np.array(shard.oppo_elo[idx], dtype=np.int64, copy=True)
        move_y = np.array(shard.move_idx[idx], dtype=np.int64, copy=True)
        value_y = np.array(shard.result[idx], dtype=np.int64, copy=True)

        return (
            torch.from_numpy(hist_boards),
            torch.from_numpy(hist_stm),
            torch.from_numpy(self_elo),
            torch.from_numpy(oppo_elo),
            torch.from_numpy(move_y),
            torch.from_numpy(value_y),
        )


class ShardBatchSampler(Sampler):
    """Yield (shard_idx, batch_indices) pairs, shuffling within and across shards."""

    def __init__(
        self,
        shards: list[ShardHandle],
        batch_size: int,
        shuffle: bool,
        seed: int,
        drop_last: bool,
    ):
        self.shards = shards
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.seed = seed
        self.drop_last = drop_last
        self.epoch = 0

    def set_epoch(self, epoch: int):
        self.epoch = epoch

    def __iter__(self):
        rng = np.random.default_rng(self.seed + self.epoch)
        batches: list[tuple[int, np.ndarray]] = []
        for shard_idx, shard in enumerate(self.shards):
            n = shard.length
            order = rng.permutation(n) if self.shuffle else np.arange(n, dtype=np.int64)
            for start in range(0, n, self.batch_size):
                end = start + self.batch_size
                if end > n and self.drop_last and n >= self.batch_size:
                    continue
                batches.append((shard_idx, order[start:end]))
        if self.shuffle:
            py_rng = random.Random(self.seed + self.epoch)
            py_rng.shuffle(batches)
        yield from batches

    def __len__(self) -> int:
        total = 0
        for shard in self.shards:
            if self.drop_last and shard.length >= self.batch_size:
                total += shard.length // self.batch_size
            else:
                total += (shard.length + self.batch_size - 1) // self.batch_size
        return total


def build_lr_lambda(warmup_steps: int, max_steps: int, min_lr_ratio: float):
    def lr_lambda(step: int) -> float:
        if warmup_steps > 0 and step < warmup_steps:
            return float(step + 1) / float(warmup_steps)
        progress = min(1.0, max(0.0, (step - warmup_steps) / max(1, max_steps - warmup_steps)))
        cosine = 0.5 * (1.0 + math.cos(math.pi * progress))
        return min_lr_ratio + (1.0 - min_lr_ratio) * cosine

    return lr_lambda


def load_base_model(checkpoint: Path | None, device: str) -> MAIA3Model:
    cfg = parse_maia_args(["--model", "maia3-5m", "--device", device])
    ckpt_path = checkpoint or getattr(cfg, "checkpoint_path", None) or resolve_checkpoint_path(
        resolve_model_spec("maia3-5m")
    )
    model = MAIA3Model(cfg).to(device)
    state = torch.load(ckpt_path, map_location=device, weights_only=True)
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    remapped = {k.replace("smolgen", "gab"): v for k, v in state.items()}
    missing, unexpected = model.load_state_dict(remapped, strict=False)
    if missing or unexpected:
        raise RuntimeError(f"Checkpoint mismatch: missing={missing}, unexpected={unexpected}")
    return model


@torch.no_grad()
def evaluate(
    model: MAIA3Model,
    val_loader: DataLoader,
    lambda_value: float,
    max_batches: int,
    device: str,
) -> dict[str, float]:
    model.eval()
    total_policy_ce = 0.0
    total_value_ce = 0.0
    total_top1 = 0
    total_n = 0

    for b_idx, batch in enumerate(val_loader):
        if max_batches > 0 and b_idx >= max_batches:
            break
        hist_boards, hist_stm, self_elo, oppo_elo, move_y, value_y = batch
        hist_boards = hist_boards.to(device, non_blocking=True)
        hist_stm = hist_stm.to(device, non_blocking=True)
        self_elo = self_elo.to(device, non_blocking=True)
        oppo_elo = oppo_elo.to(device, non_blocking=True)
        move_y = move_y.to(device, non_blocking=True)
        value_y = value_y.to(device, non_blocking=True)

        tokens = boards_to_tokens_torch(hist_boards, hist_stm)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            logits_move, logits_value, _ = model(tokens, self_elo, oppo_elo)
        p_ce = F.cross_entropy(logits_move.float(), move_y, reduction="sum").item()
        v_ce = F.cross_entropy(logits_value.float(), value_y, reduction="sum").item()
        top1 = (logits_move.argmax(dim=-1) == move_y).sum().item()

        bsz = move_y.shape[0]
        total_policy_ce += p_ce
        total_value_ce += v_ce
        total_top1 += top1
        total_n += bsz

    model.train()
    if total_n == 0:
        raise RuntimeError("Validation loader yielded 0 positions")
    policy_ce = total_policy_ce / total_n
    value_ce = total_value_ce / total_n
    return {
        "val_policy_ce": policy_ce,
        "val_value_ce": value_ce,
        "val_loss": policy_ce + lambda_value * value_ce,
        "val_top1": total_top1 / total_n,
        "val_positions": total_n,
    }


def save_checkpoint(
    path: Path,
    model: MAIA3Model,
    optimizer: torch.optim.Optimizer,
    scheduler: torch.optim.lr_scheduler.LambdaLR,
    step: int,
    best_val_loss: float,
    no_improve: int,
    args_dict: dict,
):
    torch.save(
        {
            "step": step,
            "best_val_loss": best_val_loss,
            "no_improve": no_improve,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "args": args_dict,
        },
        path,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--checkpoint", default=None, type=Path)
    parser.add_argument("--resume", default=None, type=Path)
    parser.add_argument("--batch-size", default=2048, type=int)
    parser.add_argument("--lr", default=3e-5, type=float)
    parser.add_argument("--weight-decay", default=0.01, type=float)
    # Loss = CE(policy) + lambda_value * CE(value). Plain CE over all 4352 moves
    # (no illegal-move masking during training, matching standard policy training).
    parser.add_argument("--lambda-value", default=1.0, type=float)
    parser.add_argument("--max-steps", default=50000, type=int)
    parser.add_argument("--warmup-steps", default=500, type=int)
    parser.add_argument("--min-lr-ratio", default=0.1, type=float)
    parser.add_argument("--grad-clip", default=1.0, type=float)
    parser.add_argument("--eval-every", default=500, type=int)
    parser.add_argument("--val-max-batches", default=250, type=int)
    parser.add_argument("--save-every", default=1000, type=int)
    parser.add_argument("--log-every", default=50, type=int)
    parser.add_argument("--patience", default=10, type=int)
    parser.add_argument("--num-workers", default=4, type=int)
    parser.add_argument("--seed", default=1523, type=int)
    # Optional Lichess mixing hook (not implemented in SIG-1523; no Lichess download here).
    parser.add_argument("--mix-lichess", default=None, type=Path, help="Optional Lichess shard dir (TODO)")
    parser.add_argument("--mix-lichess-ratio", default=0.0, type=float, help="Fraction of batch from Lichess (TODO)")
    args = parser.parse_args()

    if args.mix_lichess is not None or args.mix_lichess_ratio > 0.0:
        raise NotImplementedError(
            "--mix-lichess is a reserved interface hook for mixing Lichess shards; "
            "no Lichess data is downloaded or mixed in SIG-1523."
        )

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    random.seed(args.seed)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = args.out_dir / "metrics.jsonl"

    train_ds = ShardedBoardBatchDataset(args.data_dir / "train")
    val_ds = ShardedBoardBatchDataset(args.data_dir / "val")
    print(
        f"Loaded shards: train={train_ds.total_positions:,} pos ({len(train_ds.shards)} shards) | "
        f"val={val_ds.total_positions:,} pos ({len(val_ds.shards)} shards)",
        flush=True,
    )

    train_sampler = ShardBatchSampler(
        train_ds.shards, args.batch_size, shuffle=True, seed=args.seed, drop_last=True
    )
    val_sampler = ShardBatchSampler(
        val_ds.shards, args.batch_size, shuffle=False, seed=args.seed, drop_last=False
    )

    loader_kwargs = {
        "batch_size": None,
        "num_workers": args.num_workers,
        "pin_memory": True,
    }
    if args.num_workers > 0:
        loader_kwargs["prefetch_factor"] = 4
        loader_kwargs["persistent_workers"] = True

    train_loader = DataLoader(train_ds, sampler=train_sampler, **loader_kwargs)
    val_loader = DataLoader(val_ds, sampler=val_sampler, **loader_kwargs)

    device = "cuda"
    model = load_base_model(args.checkpoint, device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.LambdaLR(
        optimizer, build_lr_lambda(args.warmup_steps, args.max_steps, args.min_lr_ratio)
    )

    step = 0
    best_val_loss = float("inf")
    no_improve = 0
    if args.resume is not None:
        ckpt = torch.load(args.resume, map_location=device, weights_only=True)
        model.load_state_dict(ckpt["model_state_dict"])
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        scheduler.load_state_dict(ckpt["scheduler_state_dict"])
        step = int(ckpt["step"])
        best_val_loss = float(ckpt.get("best_val_loss", float("inf")))
        no_improve = int(ckpt.get("no_improve", 0))
        print(f"Resumed from {args.resume} at step {step} (best_val_loss={best_val_loss:.4f})", flush=True)

    args_dict = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()}
    (args.out_dir / "config.json").write_text(json.dumps(args_dict, indent=2), encoding="utf-8")

    model.train()
    epoch = 0
    t_window = monotonic()
    pos_window = 0
    loss_window = 0.0
    p_loss_window = 0.0
    v_loss_window = 0.0
    steps_window = 0

    def log_metric(record: dict):
        with metrics_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")

    if step == 0:
        val_stats = evaluate(model, val_loader, args.lambda_value, args.val_max_batches, device)
        val_stats["step"] = 0
        val_stats["type"] = "val"
        log_metric(val_stats)
        print(
            f"[val step 0] loss={val_stats['val_loss']:.4f} "
            f"policy={val_stats['val_policy_ce']:.4f} "
            f"value={val_stats['val_value_ce']:.4f} "
            f"top1={val_stats['val_top1']:.2%}",
            flush=True,
        )

    stop_early = False
    while step < args.max_steps and not stop_early:
        train_sampler.set_epoch(epoch)
        for batch in train_loader:
            hist_boards, hist_stm, self_elo, oppo_elo, move_y, value_y = batch
            hist_boards = hist_boards.to(device, non_blocking=True)
            hist_stm = hist_stm.to(device, non_blocking=True)
            self_elo = self_elo.to(device, non_blocking=True)
            oppo_elo = oppo_elo.to(device, non_blocking=True)
            move_y = move_y.to(device, non_blocking=True)
            value_y = value_y.to(device, non_blocking=True)

            tokens = boards_to_tokens_torch(hist_boards, hist_stm)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                logits_move, logits_value, _ = model(tokens, self_elo, oppo_elo)
                p_loss = F.cross_entropy(logits_move.float(), move_y)
                v_loss = F.cross_entropy(logits_value.float(), value_y)
                loss = p_loss + args.lambda_value * v_loss

            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
            optimizer.step()
            scheduler.step()

            step += 1
            bsz = move_y.shape[0]
            pos_window += bsz
            loss_window += float(loss.item())
            p_loss_window += float(p_loss.item())
            v_loss_window += float(v_loss.item())
            steps_window += 1

            if step % args.log_every == 0 or step == args.max_steps:
                dt = monotonic() - t_window
                pos_per_s = pos_window / max(dt, 1e-6)
                rec = {
                    "type": "train",
                    "step": step,
                    "epoch": epoch,
                    "lr": scheduler.get_last_lr()[0],
                    "loss": loss_window / steps_window,
                    "policy_ce": p_loss_window / steps_window,
                    "value_ce": v_loss_window / steps_window,
                    "pos_per_s": round(pos_per_s, 1),
                }
                log_metric(rec)
                print(
                    f"[step {step}/{args.max_steps}] loss={rec['loss']:.4f} "
                    f"(p={rec['policy_ce']:.4f}, v={rec['value_ce']:.4f}) "
                    f"lr={rec['lr']:.2e} | {pos_per_s:,.0f} pos/s",
                    flush=True,
                )
                t_window = monotonic()
                pos_window = 0
                loss_window = 0.0
                p_loss_window = 0.0
                v_loss_window = 0.0
                steps_window = 0

            if step % args.eval_every == 0 or step == args.max_steps:
                val_stats = evaluate(model, val_loader, args.lambda_value, args.val_max_batches, device)
                val_stats["step"] = step
                val_stats["type"] = "val"
                log_metric(val_stats)
                improved = val_stats["val_loss"] < best_val_loss
                if improved:
                    best_val_loss = val_stats["val_loss"]
                    no_improve = 0
                    save_checkpoint(
                        args.out_dir / "best.pt",
                        model,
                        optimizer,
                        scheduler,
                        step,
                        best_val_loss,
                        no_improve,
                        args_dict,
                    )
                else:
                    no_improve += 1
                print(
                    f"[val step {step}] loss={val_stats['val_loss']:.4f} "
                    f"policy={val_stats['val_policy_ce']:.4f} "
                    f"value={val_stats['val_value_ce']:.4f} "
                    f"top1={val_stats['val_top1']:.2%} "
                    f"{'*BEST*' if improved else f'(no_improve={no_improve})'}",
                    flush=True,
                )
                if args.patience > 0 and no_improve >= args.patience:
                    print(f"Early stopping at step {step} (patience={args.patience})", flush=True)
                    stop_early = True
                    break

            if step % args.save_every == 0 or step == args.max_steps:
                save_checkpoint(
                    args.out_dir / f"step_{step:06d}.pt",
                    model,
                    optimizer,
                    scheduler,
                    step,
                    best_val_loss,
                    no_improve,
                    args_dict,
                )
                save_checkpoint(
                    args.out_dir / "last.pt",
                    model,
                    optimizer,
                    scheduler,
                    step,
                    best_val_loss,
                    no_improve,
                    args_dict,
                )

            if step >= args.max_steps:
                break
        epoch += 1

    save_checkpoint(
        args.out_dir / "last.pt",
        model,
        optimizer,
        scheduler,
        step,
        best_val_loss,
        no_improve,
        args_dict,
    )
    print(f"Training finished at step {step}. Best val_loss={best_val_loss:.4f}", flush=True)


if __name__ == "__main__":
    main()
