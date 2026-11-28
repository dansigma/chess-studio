#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "Usage: $0 <positions.jsonl> <output.jsonl> [run_toby.py args...]" >&2
    exit 1
fi

INPUT_JSONL="$(realpath "$1")"
OUTPUT_JSONL="$(realpath -m "$2")"
shift 2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${TOBY_PYTHON:-$HOME/toby/.venv/bin/python}"
UNIT_NAME="${TOBY_UNIT:-toby-bench-$(date +%Y%m%d-%H%M%S)}"
LOG_FILE="${OUTPUT_JSONL%.jsonl}.log"

mkdir -p "$(dirname "$OUTPUT_JSONL")"

# The user systemd manager's PATH lacks /usr/lib/wsl/lib, where WSL exposes the NVIDIA tools.
# Without it Toby can't see the GPU and silently falls back from Accurate to Standard.

echo "Starting systemd-run unit: $UNIT_NAME"
echo "Log file: $LOG_FILE"

systemd-run --user \
    --unit="$UNIT_NAME" \
    --description="Toby 2 move-prediction benchmark" \
    --setenv=PATH="$PATH" \
    ${LD_LIBRARY_PATH:+--setenv=LD_LIBRARY_PATH="$LD_LIBRARY_PATH"} \
    --property="StandardOutput=append:$LOG_FILE" \
    --property="StandardError=append:$LOG_FILE" \
    "$PYTHON_BIN" "$SCRIPT_DIR/run_toby.py" \
    --input "$INPUT_JSONL" \
    --output "$OUTPUT_JSONL" \
    "$@"

echo "Check status: systemctl --user status $UNIT_NAME"
echo "Follow logs:  tail -f $LOG_FILE"
