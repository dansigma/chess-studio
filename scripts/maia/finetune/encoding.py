"""Compact uint8 board encoding and vectorized (B, 64, 97) token reconstruction."""

from __future__ import annotations

import chess
import numpy as np

HISTORY = 8
WIDTH = HISTORY * 12 + 1  # 97

# Square permutation for Black-to-move mirroring (rank flip: square ^ 56).
MIRROR_SQUARES = np.arange(64, dtype=np.int64) ^ 56

# Piece code LUT: 0=empty, 1..6=White P,N,B,R,Q,K, 7..12=Black p,n,b,r,q,k.
# Row 0 (White to move): identity. Row 1 (Black to move): swap White and Black.
COLOR_SWAP_LUT = np.array(
    [
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        [0, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
    ],
    dtype=np.uint8,
)

# Precomputed (2, 13, 12) one-hot lookup tables for White (0) and Black (1) to move.
_ONE_HOT_13 = np.eye(13, dtype=np.float32)[:, 1:]  # (13, 12), row 0 is all zeros
TOKEN_LUT_NP = np.stack(
    [_ONE_HOT_13[COLOR_SWAP_LUT[0]], _ONE_HOT_13[COLOR_SWAP_LUT[1]]],
    axis=0,
)  # (2, 13, 12)


def board_to_uint8(board: chess.Board) -> np.ndarray:
    """Encode a chess.Board in absolute orientation as uint8[64] with codes 0..12."""
    arr = np.zeros(64, dtype=np.uint8)
    for sq, piece in board.piece_map().items():
        arr[sq] = piece.piece_type + (0 if piece.color == chess.WHITE else 6)
    return arr


def boards_to_tokens_np(hist_boards: np.ndarray, hist_stm: np.ndarray) -> np.ndarray:
    """Convert (B, 8, 64) uint8 boards and (B, 8) uint8 stm to (B, 64, 97) float32 tokens."""
    bsz, hist_len, n_sq = hist_boards.shape
    if hist_len != HISTORY or n_sq != 64:
        raise ValueError(f"Expected (B, {HISTORY}, 64), got {hist_boards.shape}")

    stm_mask = hist_stm.astype(bool)
    oriented = np.where(
        stm_mask[:, :, None],
        hist_boards[:, :, MIRROR_SQUARES],
        hist_boards,
    )
    # Map (B, 8, 64) piece codes + stm -> (B, 8, 64, 12) one-hot.
    one_hot = TOKEN_LUT_NP[hist_stm[:, :, None], oriented]
    # (B, 8, 64, 12) -> (B, 64, 8, 12) -> (B, 64, 96)
    board_tokens = one_hot.transpose(0, 2, 1, 3).reshape(bsz, 64, HISTORY * 12)
    tokens = np.zeros((bsz, 64, WIDTH), dtype=np.float32)
    tokens[:, :, : HISTORY * 12] = board_tokens
    return tokens


_DEVICE_TABLES = {}


def _device_tables(device):
    """Mirror-square index and token LUT, copied to each device once."""
    import torch

    key = str(device)
    if key not in _DEVICE_TABLES:
        _DEVICE_TABLES[key] = (
            torch.as_tensor(MIRROR_SQUARES, device=device, dtype=torch.long),
            torch.as_tensor(TOKEN_LUT_NP, device=device, dtype=torch.float32),
        )
    return _DEVICE_TABLES[key]


def boards_to_tokens_torch(hist_boards, hist_stm):
    """PyTorch (CPU or CUDA) version of boards_to_tokens_np.

    hist_boards: (B, 8, 64) uint8/long tensor
    hist_stm:    (B, 8) uint8/long tensor
    Returns:     (B, 64, 97) float32 tensor on the same device.
    """
    import torch

    if hist_boards.ndim != 3 or tuple(hist_boards.shape[1:]) != (HISTORY, 64):
        raise ValueError(f"hist_boards must be (B, {HISTORY}, 64), got {tuple(hist_boards.shape)}")
    device = hist_boards.device
    bsz = hist_boards.shape[0]
    mirror_sq, lut = _device_tables(device)

    stm_long = hist_stm.long()
    stm_mask = stm_long.bool().unsqueeze(-1)  # (B, 8, 1)
    mirrored = hist_boards.index_select(dim=2, index=mirror_sq)
    oriented = torch.where(stm_mask, mirrored, hist_boards).long()  # (B, 8, 64)

    one_hot = lut[stm_long.unsqueeze(-1), oriented]  # (B, 8, 64, 12)
    board_tokens = one_hot.permute(0, 2, 1, 3).reshape(bsz, 64, HISTORY * 12)
    zeros = torch.zeros((bsz, 64, 1), device=device, dtype=torch.float32)
    return torch.cat([board_tokens, zeros], dim=-1)
