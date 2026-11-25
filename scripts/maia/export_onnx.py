"""Export the pinned Maia-3 5M model for ONNX Runtime Web."""

import argparse
from pathlib import Path
from types import MethodType, SimpleNamespace

import onnx
import torch
from maia3.model_registry import resolve_checkpoint_path, resolve_model_spec
from maia3.uci import load_model


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--checkpoint", type=Path)
    args = parser.parse_args()

    spec = resolve_model_spec("maia3-5m")
    checkpoint = args.checkpoint or resolve_checkpoint_path(spec)
    cfg = SimpleNamespace(**spec.config, device="cpu", checkpoint_path=checkpoint)
    model = PolicyAndValue(load_model(cfg)).eval()
    for layer in model.modules():
        if isinstance(layer, torch.nn.RMSNorm):
            layer.forward = MethodType(exportable_rms_norm, layer)
    inputs = ["tokens", "self_elo", "oppo_elo"]
    outputs = ["move_logits", "value_logits"]
    torch.backends.mha.set_fastpath_enabled(False)
    torch.set_num_threads(1)
    ratings = torch.full((2,), 1500, dtype=torch.long)
    torch.onnx.export(
        model,
        (torch.zeros(2, 64, 12 * cfg.history + 1), ratings, ratings),
        args.output,
        input_names=inputs,
        output_names=outputs,
        dynamic_axes={name: {0: "batch"} for name in inputs + outputs},
        opset_version=17,
        dynamo=False,
    )
    onnx.checker.check_model(args.output)


if __name__ == "__main__":
    main()
