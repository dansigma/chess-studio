// Lets `node --test` resolve imports the way the Next bundler does:
// the `@/` path alias, extensionless relative `.ts`/`.tsx` specifiers, and
// `.tsx` modules — JSX is beyond Node's built-in type stripping, so those
// files are transpiled with the repo's own TypeScript before loading.
import { createRequire, registerHooks } from "node:module";
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
  "next/cache": "src/test-utils/stubs/next-cache.ts",
  "next/link": "src/test-utils/stubs/next-link.ts",
  "server-only": "src/test-utils/stubs/server-only.ts",
  "cloudflare:workers": "src/test-utils/stubs/cloudflare-workers.ts",
};

/**
 * Picks the `load`-hook `format` for a `file:` URL whose `nextLoad` chain
 * threw `ERR_INVALID_RETURN_PROPERTY_VALUE`, so the hook can read the source
 * itself and short-circuit (SIG-1181). Mirrors Node's own default: `.mjs` is
 * always ESM, `.cjs`/`.json` keep their fixed formats, and `.js` follows the
 * nearest `package.json` `type` field (defaulting to CommonJS).
 */
export function formatForFallback(url) {
  if (url.endsWith(".mjs")) {
    return "module";
  }
  if (url.endsWith(".cjs")) {
    return "commonjs";
  }
  if (url.endsWith(".json")) {
    return "json";
  }
  let dir = fileURLToPath(new URL("./", url));
  while (true) {
    const candidate = `${dir}package.json`;
    if (existsSync(candidate)) {
      try {
        if (JSON.parse(readFileSync(candidate, "utf8"))?.type === "module") {
          return "module";
        }
      } catch {
        // Unreadable manifest: fall through to CommonJS below.
      }
      return "commonjs";
    }
    const parent = fileURLToPath(new URL("../", `${pathToFileURL(dir)}/`));
    if (parent === dir) {
      return "commonjs";
    }
    dir = parent;
  }
}

/**
 * Runs `nextLoad` for a `file:` URL, falling back to a direct source read
 * when the chain throws `ERR_INVALID_RETURN_PROPERTY_VALUE` (SIG-1181).
 *
 * Root cause: on Node 22.18–22.20, registering ANY `load` hook forces strict
 * sync validation of every chained result, and Node's own default CJS load
 * settles `{ format: "commonjs", source: null }` — rejected the moment a
 * hook passes it through. Every failing suite imports a CJS dep without an
 * `exports` map (`chess.js`, `xss`, `@mliebelt/pgn-parser`); re-reading the
 * file and short-circuiting is exactly what the default loader would have
 * produced. Anything that is not a null-source validation failure rethrows.
 */
export function loadWithCjsFallback(url, context, nextLoad) {
  try {
    return nextLoad(url, context);
  } catch (error) {
    if (error?.code !== "ERR_INVALID_RETURN_PROPERTY_VALUE" || !url.startsWith("file:")) {
      throw error;
    }
    const path = fileURLToPath(url);
    return {
      format: formatForFallback(url),
      source: readFileSync(path, "utf8"),
      shortCircuit: true,
    };
  }
}

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
    // SIG-1181: on Node 22.18–22.20, registering ANY `load` hook forces strict
    // sync validation of every chained result, and Node's own default CJS
    // load settles `source: null` — rejected the moment a hook passes it
    // through. `loadWithCjsFallback` re-reads those files and short-circuits
    // with what the default loader would have produced.
    return loadWithCjsFallback(url, context, nextLoad);
  },
});
