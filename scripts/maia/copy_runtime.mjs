import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { dependencies } = require("../../package.json");
const version = dependencies["onnxruntime-web"];
const output = new URL(`../../public/engine/maia/ort/${version}/`, import.meta.url);
mkdirSync(output, { recursive: true });

for (const extension of ["mjs", "wasm"]) {
  const filename = `ort-wasm-simd-threaded.${extension}`;
  const source = new URL(`../../node_modules/onnxruntime-web/dist/${filename}`, import.meta.url);
  if (statSync(source).size > 25 * 1024 * 1024) {
    throw new Error(`${filename} exceeds the 25 MiB Workers asset limit`);
  }
  copyFileSync(source, new URL(filename, output));
}
