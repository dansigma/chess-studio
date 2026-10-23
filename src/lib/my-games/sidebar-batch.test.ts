// SIG-1090: source-text assertions for the My Games batch-review UI.
// Mirrors `sidebar-resize.test.ts`: no `node:test` suite imports a `.tsx`
// component, so these pin the UI contract (checkboxes, batch buttons,
// progress + Cancel, accuracy badge, batch lease seam) against the source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sidebar = readFileSync(new URL("../../studio/MyGamesSidebar.tsx", import.meta.url), "utf8");

describe("My Games batch review UI (SIG-1090)", () => {
  it("offers per-row selection and batch controls with progress + cancel", () => {
    assert.ok(sidebar.includes('type="checkbox"'), "rows must be selectable via checkboxes");
    assert.ok(sidebar.includes("myGames.reviewSelected"), "must offer a Review selected action");
    assert.ok(sidebar.includes("myGames.reviewAllUnreviewed"), "must offer a Review all unreviewed action");
    assert.ok(sidebar.includes("myGames.reviewing"), "must show batch progress");
    assert.ok(sidebar.includes("myGames.cancel"), "must offer batch cancel");
  });

  it("renders reviewed accuracies and reports skipped games", () => {
    assert.ok(sidebar.includes("userAccuracy"), "reviewed rows must surface the user accuracy");
    assert.ok(sidebar.includes("myGames.reviewFailed"), "skipped games must surface a notice");
  });

  it("runs at the batch engine priority with the e2e fake seam", () => {
    assert.ok(sidebar.includes('acquire("batch"'), "the batch must lease the lowest-priority engine slot");
    assert.ok(sidebar.includes("isE2eFakeReviewEnabled"), "the batch must honor the e2e fake engine seam");
    assert.ok(sidebar.includes("DEFAULT_REVIEW_PRESET"), "the batch must reuse the default review preset");
  });

  it("reads the in-flight batch at cleanup time, not at effect time", () => {
    // A stale `const current = batchRef.current` captured on mount freezes the
    // pre-batch value, so an unmount mid-batch would cancel nothing.
    assert.ok(!sidebar.includes("const current = batchRef.current"), "must not freeze the batch ref at effect time");
    assert.ok(sidebar.includes("batchRef.current?.cancel()"), "unmount cleanup must cancel the current batch");
    assert.ok(sidebar.includes("batchRef.current?.release()"), "unmount cleanup must release the current lease");
  });

  it("writes finished summaries to the four granted columns", () => {
    assert.ok(sidebar.includes("user_accuracy"), "must write back user_accuracy");
    assert.ok(sidebar.includes("opponent_accuracy"), "must write back opponent_accuracy");
    assert.ok(sidebar.includes("reviewed_at"), "must write back reviewed_at");
    assert.ok(sidebar.includes("mistake_counts"), "must write back mistake_counts");
  });
});
