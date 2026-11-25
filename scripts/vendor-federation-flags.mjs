// Extract the pinned npm package into a local directory before running:
// mkdir -p data/flag-vendor
// npm pack flag-icons@7.6.0 --pack-destination data/flag-vendor
// tar -xzf data/flag-vendor/flag-icons-7.6.0.tgz -C data/flag-vendor
// node --import ./scripts/test-resolve.mjs scripts/vendor-federation-flags.mjs data/flag-vendor/package
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
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
    const source = resolve(packageDirectory, "flags/4x3", `${code}.svg`);
    // Render at 3× the 20×15 CSS size and preserve transparent areas.
    const contents = await sharp(source)
      .resize(60, 45, { fit: "fill" })
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    return [`${code}.webp`, contents];
  }),
  ["LICENSE", await readFile(resolve(packageDirectory, "LICENSE"))],
]);

const output = new URL("../public/flags/", import.meta.url);
await mkdir(output, { recursive: true });
await Promise.all(files.map(([file, contents]) => writeFile(new URL(file, output), contents)));
