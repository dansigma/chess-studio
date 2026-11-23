// scripts/xd-database/local-source.mjs
// SIG-1449: an XdRangeSource over a local build folder (inspect, tests).
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import { join } from "node:path";

export function localSource(dir, counter = { reads: 0 }) {
  return async (file, range) => {
    counter.reads += 1;
    const path = join(dir, file);
    if (!range) {
      return new Uint8Array(readFileSync(path));
    }
    const length = range.end - range.start;
    const bytes = new Uint8Array(length);
    const fd = openSync(path, "r");
    try {
      let done = 0;
      while (done < length) {
        const read = readSync(fd, bytes, done, length - done, range.start + done);
        if (read === 0) {
          throw new Error(`${file}: range ${range.start}-${range.end} past the end`);
        }
        done += read;
      }
    } finally {
      closeSync(fd);
    }
    return bytes;
  };
}
