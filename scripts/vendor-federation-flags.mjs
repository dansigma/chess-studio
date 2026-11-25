// Extract the pinned npm package into a local directory before running:
// npm pack flag-icons@7.6.0 --pack-destination .artifacts
// tar -xzf .artifacts/flag-icons-7.6.0.tgz -C .artifacts
// node --import ./scripts/test-resolve.mjs scripts/vendor-federation-flags.mjs .artifacts/package
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FIDE_TO_ISO } from "../src/lib/live/federation.ts";

const packageDirectory = process.argv[2];
if (!packageDirectory) throw new Error("Pass the extracted flag-icons package directory.");

const manifest = JSON.parse(await readFile(resolve(packageDirectory, "package.json"), "utf8"));
if (manifest.name !== "flag-icons" || manifest.version !== "7.6.0") {
  throw new Error("Expected flag-icons@7.6.0.");
}

const codes = [...new Set(Object.values(FIDE_TO_ISO))].sort();
const files = await Promise.all([
  ...codes.map(async (code) => {
    const file = `${code}.svg`;
    return [file, await readFile(resolve(packageDirectory, "flags/4x3", file))];
  }),
  ["LICENSE", await readFile(resolve(packageDirectory, "LICENSE"))],
]);

const output = new URL("../public/flags/", import.meta.url);
await mkdir(output, { recursive: true });
await Promise.all(files.map(([file, contents]) => writeFile(new URL(file, output), contents)));
