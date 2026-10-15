#!/usr/bin/env node
/**
 * Wrapper de deploy do vinext para o Workers.
 *
 * Os wasm "full" do engine (~95MB cada) NÃO são versionados em public/engine/
 * (são servidos exclusivamente do bucket R2 chess-studio-engine via
 * app/engine/[...path]). Se forem baixados localmente para testes, avisa caso
 * estejam presentes em public/engine/ para evitar que o pipeline estático do
 * vinext tente enviá-los no binding de ASSETS (limite de 25MiB).
 */
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const files = [
  "public/engine/full/stockfish-19.wasm",
  "public/engine/stockfish-19-single.wasm",
];

for (const rel of files) {
  const filePath = path.join(root, rel);
  if (existsSync(filePath)) {
    const sizeMb = (statSync(filePath).size / (1024 * 1024)).toFixed(1);
    console.warn(
      `[vinext-deploy] Aviso: ${rel} (${sizeMb} MB) encontrado em public/engine. ` +
        `O limite de assets estáticos do Workers é 25 MiB; os wasm full devem ser servidos via R2.`,
    );
  }
}

console.log("[vinext-deploy] Rodando vinext-cloudflare deploy...");

let code = 0;
try {
  execSync("vinext-cloudflare deploy", { stdio: "inherit", cwd: root, env: process.env });
} catch (e) {
  code = typeof e.status === "number" ? e.status : 1;
}
process.exit(code);
