"""Self-checks for Maia-3 fine-tuning: encoder, history loader, and upstream maia3 parity."""

from __future__ import annotations

from collections import deque
import hashlib
import json
from pathlib import Path
import sys
import tempfile

import chess
import numpy as np

THIS_DIR = Path(__file__).resolve().parent
MAIA_DIR = THIS_DIR.parent
ROOT = THIS_DIR.parents[2]
sys.path.insert(0, str(THIS_DIR))
sys.path.insert(0, str(MAIA_DIR))

import calibrate  # noqa: E402
from encoding import HISTORY, board_to_uint8, boards_to_tokens_np  # noqa: E402
import prepare_data  # noqa: E402


def test_encoder_fixtures():
    fixtures = json.loads((ROOT / "src/engine/maia/fixtures/encoder.json").read_text())
    for fx in fixtures:
        boards = [chess.Board(fen) for fen in fx["fens"]][-HISTORY:]
        if len(boards) < HISTORY:
            boards = [boards[0]] * (HISTORY - len(boards)) + boards
        b_u8 = np.stack([board_to_uint8(b) for b in boards], axis=0)[None, :, :]
        stm = np.array([[0 if b.turn == chess.WHITE else 1 for b in boards]], dtype=np.uint8)
        tokens = boards_to_tokens_np(b_u8, stm)[0]
        digest = hashlib.sha256(tokens.astype("<f4").tobytes()).hexdigest()
        assert digest == fx["tokenHash"], f"Token hash mismatch for {fx['name']}"

        # Also compare against calibrate.encode_history directly.
        ref = calibrate.encode_history([calibrate.board_channels(b) for b in boards]).astype(np.float32)
        assert np.array_equal(tokens, ref), f"Array mismatch for {fx['name']}"

        try:
            import torch
            from encoding import boards_to_tokens_torch

            t_tokens = boards_to_tokens_torch(
                torch.from_numpy(b_u8), torch.from_numpy(stm)
            ).numpy()[0]
            assert np.array_equal(tokens, t_tokens), f"Torch encoder mismatch for {fx['name']}"
        except ImportError:
            pass
    print(f"PASS test_encoder_fixtures ({len(fixtures)} fixtures)", flush=True)


def test_loader_and_upstream_parity():
    # Real game sequence with opening, castling, capture, and promotion.
    uci_moves = [
        "e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6",
        "e1g1", "f8e7", "d2d4", "e5d4", "e4e5", "f6e4", "f1e1", "e4c5",
    ]
    board = chess.Board()
    boards_u8 = []
    stms = []
    move_indices = []
    ref_tokens = []
    hist_calib = []
    legal_idx_all = []
    legal_lens = []
    fens = []

    for uci in uci_moves:
        move = chess.Move.from_uci(uci)
        fens.append(board.fen())
        boards_u8.append(board_to_uint8(board))
        stms.append(0 if board.turn == chess.WHITE else 1)
        move_indices.append(calibrate.move_index(move, board.turn))
        legal = [calibrate.move_index(m, board.turn) for m in board.legal_moves]
        legal_idx_all.extend(legal)
        legal_lens.append(len(legal))
        hist_calib.append(calibrate.board_channels(board))
        ref_tokens.append(calibrate.encode_history(hist_calib).astype(np.float32))
        board.push(move)

    with tempfile.TemporaryDirectory() as tmp:
        shard_dir = Path(tmp) / "train" / "shard_0000"
        shard_dir.mkdir(parents=True)
        n = len(uci_moves)
        np.save(shard_dir / "boards.npy", np.stack(boards_u8, axis=0))
        np.save(shard_dir / "stm.npy", np.array(stms, dtype=np.uint8))
        np.save(shard_dir / "move_idx.npy", np.array(move_indices, dtype=np.uint16))
        np.save(shard_dir / "result.npy", np.array([2 if s == 0 else 0 for s in stms], dtype=np.uint8))
        np.save(shard_dir / "self_elo.npy", np.full(n, 2100, dtype=np.uint16))
        np.save(shard_dir / "oppo_elo.npy", np.full(n, 2050, dtype=np.uint16))
        np.save(shard_dir / "game_id.npy", np.zeros(n, dtype=np.uint32))
        np.save(shard_dir / "ply.npy", np.arange(n, dtype=np.uint16))

        # Verify v1 shards without legal moves are refused.
        try:
            import torch  # noqa: F401
            from train import ShardedBoardBatchDataset, build_legal_mask

            try:
                ShardedBoardBatchDataset(Path(tmp) / "train")
                raise AssertionError("Expected FileNotFoundError for v1 shard without legal moves")
            except FileNotFoundError:
                pass
        except ImportError:
            pass

        legal_offsets = np.empty(n + 1, dtype=np.int64)
        legal_offsets[0] = 0
        np.cumsum(legal_lens, dtype=np.int64, out=legal_offsets[1:])
        np.save(shard_dir / "legal_idx.npy", np.array(legal_idx_all, dtype=np.uint16))
        np.save(shard_dir / "legal_offsets.npy", legal_offsets)

        # Verify CSR legal moves match python-chess legal moves and contain the label.
        for ply, fen in enumerate(fens):
            b_chk = chess.Board(fen)
            expected_legal = sorted(calibrate.move_index(m, b_chk.turn) for m in b_chk.legal_moves)
            stored_legal = sorted(
                int(x) for x in legal_idx_all[legal_offsets[ply] : legal_offsets[ply + 1]]
            )
            assert stored_legal == expected_legal, f"Legal move mismatch at ply {ply}"
            assert move_indices[ply] in stored_legal, f"Label missing from legal moves at ply {ply}"

        try:
            import torch
            from encoding import boards_to_tokens_torch
            from train import ShardedBoardBatchDataset, build_legal_mask

            ds = ShardedBoardBatchDataset(Path(tmp) / "train")
            idx = np.arange(n, dtype=np.int64)
            hb, hs, _se, _oe, my, _vy, lm = ds[(0, idx)]
            got_tokens = boards_to_tokens_torch(hb, hs).numpy()
            mask = build_legal_mask(lm)
            assert mask.gather(1, my.unsqueeze(1)).all(), "Label not in built legal mask"
            for ply in range(n):
                assert np.array_equal(got_tokens[ply], ref_tokens[ply]), f"Loader mismatch at ply {ply}"
                assert int(my[ply]) == move_indices[ply]
                b_chk = chess.Board(fens[ply])
                expected_legal = sorted(calibrate.move_index(m, b_chk.turn) for m in b_chk.legal_moves)
                assert mask[ply].nonzero(as_tuple=False).squeeze(1).tolist() == expected_legal
        except ImportError:
            pass

    # If upstream maia3 is installed (desktop), compare directly against get_historical_tokens and get_legal_moves_mask.
    try:
        from types import SimpleNamespace
        from maia3.dataset import get_historical_tokens, get_legal_moves_mask, tokenize_board
        from maia3.utils import get_all_possible_moves, mirror_move

        all_moves = {m: i for i, m in enumerate(get_all_possible_moves())}
        cfg = SimpleNamespace(history=8, include_time_info=False)
        b = chess.Board()
        dq = deque(maxlen=8)
        for ply, uci in enumerate(uci_moves):
            dq.append(tokenize_board(b))
            up_tok = get_historical_tokens(dq, cfg, 0, 0, 0, 0).numpy()
            assert np.array_equal(up_tok, ref_tokens[ply]), f"Upstream token mismatch at ply {ply}"
            up_mask = get_legal_moves_mask(b, all_moves)
            assert torch.equal(up_mask, mask[ply]), f"Upstream legal mask mismatch at ply {ply}"
            m_uci = uci if b.turn == chess.WHITE else mirror_move(uci)
            assert all_moves[m_uci] == move_indices[ply], f"Upstream move mismatch at ply {ply}"
            b.push(chess.Move.from_uci(uci))
        print(f"PASS test_loader_and_upstream_parity ({len(uci_moves)} plies + maia3)", flush=True)
    except ImportError:
        print(f"PASS test_loader_and_upstream_parity ({len(uci_moves)} plies, no maia3)", flush=True)


def test_filter_rules():
    base = {
        b"Result": b"1-0",
        b"Event": b"World Cup",
        b"TimeControl": b"5400+30",
        b"Date": b"2023.08.01",
        b"WhiteElo": b"2650",
        b"BlackElo": b"2600",
    }
    assert prepare_data.parse_eligible_game(base) == (2650, 2600, "ok")
    low = {**base, b"WhiteElo": b"1599", b"BlackElo": b"1650"}
    assert prepare_data.parse_eligible_game(low) == (1599, 1650, "out_of_range")
    high = {**base, b"WhiteElo": b"2901", b"BlackElo": b"2850"}
    assert prepare_data.parse_eligible_game(high) == (2901, 2850, "out_of_range")
    gap = {**base, b"WhiteElo": b"2500", b"BlackElo": b"2300"}
    assert prepare_data.parse_eligible_game(gap) is None
    blitz = {**base, b"Event": b"World Blitz Championship"}
    assert prepare_data.parse_eligible_game(blitz) is None
    print("PASS test_filter_rules", flush=True)


def main():
    test_encoder_fixtures()
    test_loader_and_upstream_parity()
    test_filter_rules()


if __name__ == "__main__":
    main()
