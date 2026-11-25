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
