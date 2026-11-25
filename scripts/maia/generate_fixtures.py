"""Generate encoder golden data directly from the pinned Maia-3 Python package."""

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import chess
from maia3.dataset import get_historical_tokens, get_legal_moves_mask, tokenize_board
from maia3.model_registry import resolve_model_spec
from maia3.utils import get_all_possible_moves


def history(*moves):
    board = chess.Board()
    boards = [board.copy()]
    for move in moves:
        board.push_san(move)
        boards.append(board.copy())
    return boards


def main():
    cases = {
        "start": history(),
        "black to move": history("e4"),
        "short history": history("e4", "c5", "Nf3"),
        "history truncation": history("e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O"),
        "white castling": [chess.Board("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")],
        "black castling": [chess.Board("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1")],
        "white en passant": history("e4", "a6", "e5", "d5"),
        "black en passant": history("a3", "e5", "a4", "e4", "d4"),
        "white promotions": [chess.Board("1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1")],
        "black promotions": [chess.Board("4k3/8/8/8/8/8/p7/1R2K3 b - - 0 1")],
    }
    cfg = SimpleNamespace(**resolve_model_spec("maia3-5m").config)
    vocabulary = {move: i for i, move in enumerate(get_all_possible_moves())}
    fixtures = []
    for name, boards in cases.items():
        tokens = get_historical_tokens(
            [tokenize_board(board) for board in boards[-cfg.history:]], cfg, 0, 0, 0, 0,
        )
        fixtures.append({
            "name": name,
            "fens": [board.fen() for board in boards],
            "tokenHash": hashlib.sha256(tokens.numpy().astype("<f4").tobytes()).hexdigest(),
            "legalIndices": get_legal_moves_mask(boards[-1], vocabulary).nonzero().flatten().tolist(),
        })
    path = Path(__file__).resolve().parents[2] / "src/engine/maia/fixtures/encoder.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fixtures, indent=2) + "\n")


if __name__ == "__main__":
    main()
