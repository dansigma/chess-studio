import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeProgress } from "./progress.ts";

describe("mergeProgress", () => {
  it("keeps an only-local entry in merged and toUpload", () => {
    const { merged, toUpload } = mergeProgress({ v1: { step: 3, learned: false } }, {});
    assert.deepEqual(merged, { v1: { step: 3, learned: false } });
    assert.deepEqual(toUpload, { v1: { step: 3, learned: false } });
  });

  it("keeps an only-remote entry in merged but not in toUpload", () => {
    const { merged, toUpload } = mergeProgress({}, { v1: { step: 2, learned: true } });
    assert.deepEqual(merged, { v1: { step: 2, learned: true } });
    assert.deepEqual(toUpload, {});
  });

  it("uploads the local values when the local step is greater", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 5, learned: false } },
      { v1: { step: 3, learned: false } },
    );
    assert.deepEqual(merged, { v1: { step: 5, learned: false } });
    assert.deepEqual(toUpload, { v1: { step: 5, learned: false } });
  });

  it("takes the remote step with no upload when the remote step is greater", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 2, learned: false } },
      { v1: { step: 4, learned: false } },
    );
    assert.deepEqual(merged, { v1: { step: 4, learned: false } });
    assert.deepEqual(toUpload, {});
  });

  it("merges learned=true and uploads on a tie when only local learned", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 3, learned: true } },
      { v1: { step: 3, learned: false } },
    );
    assert.deepEqual(merged, { v1: { step: 3, learned: true } });
    assert.deepEqual(toUpload, { v1: { step: 3, learned: true } });
  });

  it("merges learned=true with no upload on a tie when only remote learned", () => {
    const { merged, toUpload } = mergeProgress(
      { v1: { step: 3, learned: false } },
      { v1: { step: 3, learned: true } },
    );
    assert.deepEqual(merged, { v1: { step: 3, learned: true } });
    assert.deepEqual(toUpload, {});
  });
});
