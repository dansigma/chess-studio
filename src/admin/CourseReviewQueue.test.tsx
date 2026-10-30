// SIG-1175: component tests for the admin review queue. A failed approve or
// reject keeps the row and shows the translated error (locale-aware via the
// studio store); success still removes the row. The mobile card layout renders
// the same rows and actions as the desktop table.
import assert from "node:assert/strict";
import { after, before, test, mock } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { CourseReviewQueue } from "./CourseReviewQueue.tsx";
import { useStudioStore } from "../store/studio-store.ts";
import type { ReviewQueueRowData } from "@/app/admin/courses/actions.ts";

mock.module("@/src/courses/publish.ts", {
  namedExports: {
    approveCourse: async () => ({ ok: false as const, error: { key: "course.admin.error.serverUnavailable" } }),
    rejectCourse: async () => ({ ok: false as const, error: { key: "course.admin.error.serverUnavailable" } }),
  },
});

const ROW: ReviewQueueRowData = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "London System",
  authorName: "Coach",
  tier: "free",
  priceCents: null,
  submittedAt: "2026-10-20",
};

function renderQueue() {
  return render(<CourseReviewQueue initialRows={[ROW]} />);
}

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

test("failed approve keeps the row and shows the error", async () => {
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
  try {
    renderQueue();
    // Both the desktop table and the mobile card render the actions; the
    // first match is enough to exercise the approve failure path.
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]);
    const alert = await screen.findByRole("alert");
    assert.match(alert.textContent ?? "", /unavailable|Try again/i);
    assert.ok(screen.getAllByText("London System").length >= 1);
  } finally {
    cleanup();
  }
});

test("failed approve shows the Portuguese error after a locale switch", async () => {
  act(() => {
    useStudioStore.getState().setLocale("pt-br");
  });
  try {
    renderQueue();
    fireEvent.click(screen.getAllByRole("button", { name: "Rejeitar" })[0]);
    // Opening the dialog must not decide the row; close it, then fail approve.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Aprovar" })[0]);
    const alert = await screen.findByRole("alert");
    assert.match(alert.textContent ?? "", /indisponível|tente/i);
    assert.ok(screen.getAllByText("London System").length >= 1);
  } finally {
    act(() => {
      useStudioStore.getState().setLocale("en");
    });
    cleanup();
  }
});

test("failed reject keeps the dialog, the note, and the row", async () => {
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
  try {
    renderQueue();
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]);
    const note = screen.getByLabelText(/Review note/);
    fireEvent.change(note, { target: { value: "needs more work" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject course" }));
    const alert = await screen.findByRole("alert");
    assert.match(alert.textContent ?? "", /unavailable|Try again/i);
    // Dialog stays open with the note intact for retry.
    assert.equal((screen.getByLabelText(/Review note/) as HTMLTextAreaElement).value, "needs more work");
    assert.ok(screen.getAllByText("London System").length >= 1);
  } finally {
    cleanup();
  }
});

test("mobile cards render the same rows and actions as the table", async () => {
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
  try {
    renderQueue();
    const card = document.querySelector('[data-review-card="11111111-1111-4111-8111-111111111111"]');
    assert.ok(card, "expected a mobile card for the row");
    assert.ok(card!.textContent?.includes("London System"));
    const buttons = Array.from(card!.querySelectorAll("button")).map((button) => button.textContent);
    assert.ok(buttons.includes("Approve"));
    assert.ok(buttons.includes("Reject"));
    assert.ok(card!.querySelector('a[href="/admin/courses/11111111-1111-4111-8111-111111111111/preview"]'));
    // Desktop table still renders the row.
    await waitFor(() => assert.ok(screen.getAllByText("London System").length >= 2));
  } finally {
    cleanup();
  }
});
