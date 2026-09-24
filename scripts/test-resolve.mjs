// Lets `node --test` resolve imports the way the Next bundler does:
// the `@/` path alias and extensionless relative `.ts` specifiers.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = pathToFileURL(fileURLToPath(new URL("..", import.meta.url)));
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

function withExtension(url) {
  if (existsSync(fileURLToPath(url))) {
    return url;
  }
  for (const extension of EXTENSIONS) {
    const candidate = new URL(url.href + extension);
    if (existsSync(fileURLToPath(candidate))) {
      return candidate;
    }
  }
  return url;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(withExtension(new URL(specifier.slice(2), `${root.href}/`)).href, context);
    }
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
      return nextResolve(withExtension(new URL(specifier, context.parentURL)).href, context);
    }
    return nextResolve(specifier, context);
  },
});
