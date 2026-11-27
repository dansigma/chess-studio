"""Export a fine-tuned (or base) Maia-3 5M checkpoint to ONNX and verify parity."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from types import MethodType

import numpy as np
import onnx
import onnxruntime as ort
import torch

from maia3.model_registry import resolve_checkpoint_path, resolve_model_spec
from maia3.models import MAIA3Model
from maia3.uci import parse_args as parse_maia_args

THIS_DIR = Path(__file__).resolve().parent
ROOT = THIS_DIR.parents[2]
sys.path.insert(0, str(THIS_DIR))
sys.path.insert(0, str(THIS_DIR.parent))

import calibrate  # noqa: E402
from encoding import boards_to_tokens_np, board_to_uint8  # noqa: E402


class PolicyAndValue(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, tokens, self_elo, oppo_elo):
        move_logits, value_logits, _ = self.model(tokens, self_elo, oppo_elo)
        return move_logits, value_logits


def exportable_rms_norm(layer, inputs):
    # Opset 17 has no RMSNormalization operator. Decompose the FP32 inference
    # expression while preserving the learned scale and PyTorch epsilon.
    eps = layer.eps if layer.eps is not None else torch.finfo(inputs.dtype).eps
    normalized = inputs * torch.rsqrt(inputs.square().mean(dim=-1, keepdim=True) + eps)
    return normalized * layer.weight


def load_pt_model(checkpoint: Path | None) -> MAIA3Model:
    cfg = parse_maia_args(["--model", "maia3-5m", "--device", "cpu"])
    ckpt_path = checkpoint or getattr(cfg, "checkpoint_path", None) or resolve_checkpoint_path(
        resolve_model_spec("maia3-5m")
    )
    model = MAIA3Model(cfg).eval()
    state = torch.load(ckpt_path, map_location="cpu", weights_only=True)
    if isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]
    remapped = {k.replace("smolgen", "gab"): v for k, v in state.items()}
    missing, unexpected = model.load_state_dict(remapped, strict=False)
    if missing or unexpected:
        raise RuntimeError(f"Checkpoint mismatch: missing={missing}, unexpected={unexpected}")
    return model


def build_fixture_inputs(fixtures_path: Path) -> np.ndarray:
    import chess

    fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))
    batch_boards = []
    batch_stm = []
    for fx in fixtures:
        boards = [chess.Board(fen) for fen in fx["fens"]][-8:]
        if len(boards) < 8:
            boards = [boards[0]] * (8 - len(boards)) + boards
        batch_boards.append(np.stack([board_to_uint8(b) for b in boards], axis=0))
        batch_stm.append(np.array([0 if b.turn == chess.WHITE else 1 for b in boards], dtype=np.uint8))
    return boards_to_tokens_np(np.stack(batch_boards, axis=0), np.stack(batch_stm, axis=0))


def verify_io_signature(sess: ort.InferenceSession):
    inputs = [(i.name, i.shape, i.type) for i in sess.get_inputs()]
    outputs = [(o.name, o.shape, o.type) for o in sess.get_outputs()]
    expected_in = [
        ("tokens", ["batch", 64, 97], "tensor(float)"),
        ("self_elo", ["batch"], "tensor(int64)"),
        ("oppo_elo", ["batch"], "tensor(int64)"),
    ]
    expected_out = [
        ("move_logits", ["batch", 4352], "tensor(float)"),
        ("value_logits", ["batch", 3], "tensor(float)"),
    ]
    if inputs != expected_in:
        raise ValueError(f"ONNX input signature mismatch: {inputs} != {expected_in}")
    if outputs != expected_out:
        raise ValueError(f"ONNX output signature mismatch: {outputs} != {expected_out}")


def verify_parity(
    pt_model: PolicyAndValue,
    onnx_path: Path,
    fixtures_path: Path,
    compare_onnx: Path | None,
    atol: float,
):
    tokens_np = build_fixture_inputs(fixtures_path)
    n = tokens_np.shape[0]
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    verify_io_signature(sess)

    ref_sess = (
        ort.InferenceSession(str(compare_onnx), providers=["CPUExecutionProvider"])
        if compare_onnx is not None
        else None
    )
    if ref_sess is not None:
        verify_io_signature(ref_sess)

    max_pt_diff = 0.0
    max_ref_diff = 0.0
    for elo in (1800, 2200, 2600):
        elo_np = np.full((n,), elo, dtype=np.int64)
        with torch.no_grad():
            pt_move, pt_val = pt_model(
                torch.from_numpy(tokens_np),
                torch.from_numpy(elo_np),
                torch.from_numpy(elo_np),
            )
        ort_move, ort_val = sess.run(
            ["move_logits", "value_logits"],
            {"tokens": tokens_np, "self_elo": elo_np, "oppo_elo": elo_np},
        )
        diff_m = float(np.max(np.abs(pt_move.numpy() - ort_move)))
        diff_v = float(np.max(np.abs(pt_val.numpy() - ort_val)))
        max_pt_diff = max(max_pt_diff, diff_m, diff_v)
        if diff_m > atol or diff_v > atol:
            raise AssertionError(
                f"PyTorch vs ONNX parity failed at elo={elo}: move={diff_m:.6f}, value={diff_v:.6f} > {atol}"
            )

        if ref_sess is not None:
            ref_move, ref_val = ref_sess.run(
                ["move_logits", "value_logits"],
                {"tokens": tokens_np, "self_elo": elo_np, "oppo_elo": elo_np},
            )
            rm = float(np.max(np.abs(ort_move - ref_move)))
            rv = float(np.max(np.abs(ort_val - ref_val)))
            max_ref_diff = max(max_ref_diff, rm, rv)
            if rm > atol or rv > atol:
                raise AssertionError(
                    f"Reference ONNX parity failed at elo={elo}: move={rm:.6f}, value={rv:.6f} > {atol}"
                )

    msg = f"Parity OK (fixtures={n}, max |PT - ONNX| = {max_pt_diff:.2e}"
    if ref_sess is not None:
        msg += f", max |ONNX - ref| = {max_ref_diff:.2e}"
    msg += ")"
    print(msg, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--checkpoint", default=None, type=Path)
    parser.add_argument(
        "--fixtures",
        default=ROOT / "src/engine/maia/fixtures/encoder.json",
        type=Path,
    )
    parser.add_argument("--compare-onnx", default=None, type=Path)
    parser.add_argument("--atol", default=1e-3, type=float)
    parser.add_argument("--no-verify", action="store_true")
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    pt_inner = load_pt_model(args.checkpoint)
    pt_model = PolicyAndValue(pt_inner).eval()
    for layer in pt_model.modules():
        if isinstance(layer, torch.nn.RMSNorm):
            layer.forward = MethodType(exportable_rms_norm, layer)

    inputs = ["tokens", "self_elo", "oppo_elo"]
    outputs = ["move_logits", "value_logits"]
    torch.backends.mha.set_fastpath_enabled(False)
    torch.set_num_threads(1)
    ratings = torch.full((2,), 1500, dtype=torch.long)
    torch.onnx.export(
        pt_model,
        (torch.zeros(2, 64, 12 * pt_inner.cfg.history + 1), ratings, ratings),
        args.output,
        input_names=inputs,
        output_names=outputs,
        dynamic_axes={name: {0: "batch"} for name in inputs + outputs},
        opset_version=17,
        dynamo=False,
    )
    onnx.checker.check_model(args.output)
    print(f"Exported ONNX to {args.output}", flush=True)

    if not args.no_verify:
        verify_parity(pt_model, args.output, args.fixtures, args.compare_onnx, args.atol)


if __name__ == "__main__":
    main()
