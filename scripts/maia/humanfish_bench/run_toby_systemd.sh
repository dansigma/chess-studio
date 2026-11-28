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

echo "Starting systemd-run unit: $UNIT_NAME"
echo "Log file: $LOG_FILE"

systemd-run --user \
    --unit="$UNIT_NAME" \
    --description="Toby 2 move-prediction benchmark" \
    --property="StandardOutput=append:$LOG_FILE" \
    --property="StandardError=append:$LOG_FILE" \
    "$PYTHON_BIN" "$SCRIPT_DIR/run_toby.py" \
    --input "$INPUT_JSONL" \
    --output "$OUTPUT_JSONL" \
    "$@"

echo "Check status: systemctl --user status $UNIT_NAME"
echo "Follow logs:  tail -f $LOG_FILE"
