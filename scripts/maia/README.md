# Maia-3 5M model export

Studio runs the policy and value heads from [Maia-3](https://github.com/CSSLab/maia3) by CSSLab, University of Toronto. Export and fixture generation use commit `1e13597c42d4858b7cfd7cfdae01e297263364b2`. Run these commands from the chess-studio checkout, using a separate directory for the upstream code and export.

```sh
maia_tmp="$(mktemp -d)"
git clone https://github.com/CSSLab/maia3 "$maia_tmp/maia3"
git -C "$maia_tmp/maia3" checkout 1e13597c42d4858b7cfd7cfdae01e297263364b2
python3 -m venv "$maia_tmp/venv"
"$maia_tmp/venv/bin/pip" install 'torch==2.8.0' --index-url https://download.pytorch.org/whl/cpu
"$maia_tmp/venv/bin/pip" install "$maia_tmp/maia3" onnx
"$maia_tmp/venv/bin/python" scripts/maia/export_onnx.py "$maia_tmp/maia3-5m.onnx"
"$maia_tmp/venv/bin/python" scripts/maia/generate_fixtures.py
```

The exporter downloads the public 5M checkpoint from Hugging Face. Pass `--checkpoint /path/to/maia3-5m.pt` to use a local copy. The exported model uses ONNX opset 17 with a dynamic batch dimension. Keep checkpoints and exports outside Git.

Upload the export to the `chess-studio-engine` R2 bucket under `engine/maia/maia3-5m.onnx` before enabling Maia in production.

```sh
npx wrangler r2 object put chess-studio-engine/engine/maia/maia3-5m.onnx \
  --remote --file "$maia_tmp/maia3-5m.onnx" --content-type application/octet-stream
```

Studio serves the model same-origin with immutable caching. Use a new filename and update the worker URL when replacing the model. Dependency installation copies the versioned ONNX Runtime module and WASM binary into `public/engine/maia/ort/` and checks the 25 MiB Workers per-asset limit.

## Classical calibration

Run the offline fit against the Studio ONNX model and the Lumbras OTB PGN. The
script scans PGN headers, reservoir-samples games by rating, and fits a
material-phase draw adjustment on an 80% game split. It evaluates on the
remaining games using equally weighted positions at plies 16, 26, 36 and
every tenth ply before game end. The script checks the Python encoder and
material phase against the Studio fixtures before scanning the PGN.

```sh
maia_tmp="$(mktemp -d)"
python3 -m venv "$maia_tmp/venv"
"$maia_tmp/venv/bin/pip" install onnxruntime==1.32.0 python-chess==1.999 numpy
"$maia_tmp/venv/bin/python" scripts/maia/calibrate.py \
  --pgn /path/to/LumbrasGigabase_OTB_Complete.pgn \
  --model /path/to/maia3-5m.onnx \
  --seed 1503 --per-band 6000 \
  --model-elos 2300,2500,2700,2900,2900 \
  --out-ts src/engine/maia/classical-calibration.ts \
  --out-report scripts/maia/calibration-report.md
```

The default model Elo mapping is fixed and the report reads the original fit
sweep from `rating-sweep.json`. Add `--sweep` to recompute the fit grid while
keeping the configured model Elos.

Keep the PGN, model, and virtual environment outside Git. The report records
the sample sizes, rating sweep, held-out metrics, and runtime.

### Combined Maia + Stockfish calibration

`scripts/maia/calibrate_combined.py` fits a per-band multinomial logistic
regression (Draw as reference class) combining Maia's raw value-head log-odds,
Stockfish depth-16 centipawn evaluation (`tanh(cp / 400)`), and material phase.
Games are held out by tournament (`Event` + year), and Stockfish/Maia outputs
are cached as resumable JSONL files outside the repo.

```sh
maia_tmp="$(mktemp -d)"
python3 -m venv "$maia_tmp/venv"
"$maia_tmp/venv/bin/pip" install onnxruntime==1.32.0 python-chess==1.999 numpy
"$maia_tmp/venv/bin/python" scripts/maia/calibrate_combined.py \
  --pgn /home/danilo/data/xd-database/source/LumbrasGigabase_OTB_Complete.pgn \
  --model /home/danilo/data/maia/maia3-5m.onnx \
  --stockfish /home/danilo/data/stockfish/stockfish-19 \
  --cache-dir /home/danilo/data/maia/cache \
  --seed 1503 --per-band 20000 \
  --out-ts src/engine/maia/classical-combined.ts \
  --out-report scripts/maia/combined-report.md
```
