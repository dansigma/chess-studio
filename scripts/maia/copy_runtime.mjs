import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { dependencies } = require("../../package.json");
const version = dependencies["onnxruntime-web"];
const output = new URL(`../../public/engine/maia/ort/${version}/`, import.meta.url);
mkdirSync(output, { recursive: true });

// npm installs onnxruntime-web flat; the package does not export package.json to resolve it.
const dist = fileURLToPath(new URL("../../node_modules/onnxruntime-web/dist/", import.meta.url));

for (const extension of ["mjs", "wasm"]) {
  const filename = `ort-wasm-simd-threaded.${extension}`;
  const source = `${dist}${filename}`;
  if (!existsSync(source)) {
    throw new Error(`onnxruntime-web ${version} has no ${filename} in ${dist}`);
  }
  if (statSync(source).size > 25 * 1024 * 1024) {
    throw new Error(`${filename} exceeds the 25 MiB Workers asset limit`);
  }
  copyFileSync(source, new URL(filename, output));
}
