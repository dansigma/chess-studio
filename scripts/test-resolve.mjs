// Lets `node --test` resolve imports the way the Next bundler does:
// the `@/` path alias, extensionless relative `.ts`/`.tsx` specifiers, and
// `.tsx` modules — JSX is beyond Node's built-in type stripping, so those
// files are transpiled with the repo's own TypeScript before loading.
import { registerHooks, createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = pathToFileURL(fileURLToPath(new URL("..", import.meta.url)));
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
const require = createRequire(import.meta.url);

// Test doubles for modules that cannot load under plain `node --test`:
// real `next/*` needs the Next runtime, `server-only` is a build-time marker,
// and `cloudflare:workers` only exists on workerd.
const STUBS = {
  "next/server": "src/test-utils/stubs/next-server.ts",
  "next/headers": "src/test-utils/stubs/next-headers.ts",
  "next/navigation": "src/test-utils/stubs/next-navigation.ts",
  "next/link": "src/test-utils/stubs/next-link.ts",
  "server-only": "src/test-utils/stubs/server-only.ts",
  "cloudflare:workers": "src/test-utils/stubs/cloudflare-workers.ts",
};

let ts = null;

// Finds the existing file a specifier points at, completing a missing
// extension (`./tree` -> `./tree.ts`). Returns null when nothing exists.
function tsFileUrl(url) {
  if (existsSync(fileURLToPath(url))) {
    return url;
  }
  for (const extension of EXTENSIONS) {
    const candidate = new URL(url.href + extension);
    if (existsSync(fileURLToPath(candidate))) {
      return candidate;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in STUBS) {
      return nextResolve(new URL(STUBS[specifier], `${root.href}/`).href, context);
    }
    if (specifier.startsWith("@/")) {
      const url = tsFileUrl(new URL(specifier.slice(2), `${root.href}/`));
      return nextResolve(url ? url.href : specifier, context);
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      const base = new URL(specifier, context.parentURL);
      // Only step in when node could not find the file by itself: turning an
      // already-resolvable specifier into a file: URL breaks CJS require().
      if (!existsSync(fileURLToPath(base))) {
        const url = tsFileUrl(base);
        if (url) {
          return nextResolve(url.href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".tsx")) {
      ts ??= require("typescript");
      const path = fileURLToPath(url);
      const source = readFileSync(path, "utf8");
      const output = ts.transpileModule(source, {
        fileName: path,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      });
      return { format: "module", source: output.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
