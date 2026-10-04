#!/usr/bin/env node
/**
 * Wrapper de deploy do vinext para o Workers.
 *
 * Por quê: os wasm "full" do engine (~95MB cada, public/engine/) NÃO podem estar
 * em public/ durante o build — o pipeline estático do vinext passa a classificar
 * /engine/full/stockfish-19.wasm e /engine/stockfish-19-single.wasm como assets
 * do build e os drena para o binding de ASSETS (que não os contém — limite de
 * 25MiB de upload) ANTES da rota app/engine/[...path] (R2) rodar, resultando em
 * 404 vazio nesses paths.
 *
 * A solução: stash (move os wasm para node_modules/.engine-stash) → build+deploy
 * → restore (sempre, via finally). Os arquivos continuam versionados no repo em
 * public/engine/; o upload para o R2 é feito à parte (bucket chess-studio-engine).
 */
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const stash = path.join(root, "node_modules", ".engine-stash");
const files = [
  "public/engine/full/stockfish-19.wasm",
  "public/engine/stockfish-19-single.wasm",
];

mkdirSync(stash, { recursive: true });

function stashMove() {
  for (const rel of files) {
    const src = path.join(root, rel);
    if (existsSync(src)) {
      const dst = path.join(stash, path.basename(rel));
      rmSync(dst, { force: true });
      renameSync(src, dst);
    }
  }
}

function restore() {
  for (const rel of files) {
    const dst = path.join(root, rel);
    const src = path.join(stash, path.basename(rel));
    if (existsSync(src)) {
      rmSync(dst, { force: true });
      renameSync(src, dst);
    }
  }
}

stashMove();
console.log("[vinext-deploy] wasm full no stash; rodando vinext-cloudflare deploy...");

let code = 0;
try {
  execSync("vinext-cloudflare deploy", { stdio: "inherit", cwd: root, env: process.env });
} catch (e) {
  code = typeof e.status === "number" ? e.status : 1;
} finally {
  restore();
  console.log("[vinext-deploy] wasm full restaurados para public/engine.");
}
process.exit(code);
