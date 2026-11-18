import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useStudioStore } from "../store/studio-store.ts";
import type { AcceptInviteActionState } from "@/app/coach-invite/[token]/actions.ts";

const actionCtl: {
  calls: string[];
  handler?: (token: string) => Promise<AcceptInviteActionState>;
} = { calls: [] };

mock.module("@/app/coach-invite/[token]/actions.ts", {
  namedExports: {
    acceptCoachInviteAction: async (token: string): Promise<AcceptInviteActionState> => {
      actionCtl.calls.push(token);
      if (actionCtl.handler) {
        return actionCtl.handler(token);
      }
      return { status: "done", code: "accepted" };
    },
  },
});

const { InviteResult } = await import("./InviteResult.tsx");

const OriginalFormData = globalThis.FormData;

before(() => {
  const happyWindow = setupDom();
  Object.defineProperty(globalThis, "FormData", {
    value: happyWindow.FormData,
    configurable: true,
    writable: true,
    enumerable: true,
  });
});

after(async () => {
  Object.defineProperty(globalThis, "FormData", {
    value: OriginalFormData,
    configurable: true,
    writable: true,
    enumerable: true,
  });
  await teardownDom();
});

test("idle renders confirmation card in EN and PT-BR without calling the action on render", () => {
  actionCtl.calls = [];
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
  try {
    render(<InviteResult token="tok-1" userEmail="coach@example.com" />);
    assert.ok(screen.getByRole("heading", { name: "Coach invite" }));
    assert.ok(screen.getByText(/coach@example\.com/));
    assert.ok(screen.getByRole("button", { name: "Accept coach invite" }));
    assert.equal(actionCtl.calls.length, 0);
  } finally {
    cleanup();
  }

  act(() => {
    useStudioStore.getState().setLocale("pt-br");
  });
  try {
    render(<InviteResult token="tok-1" userEmail="coach@example.com" />);
    assert.ok(screen.getByRole("heading", { name: "Convite de treinador" }));
    assert.ok(screen.getByText(/coach@example\.com/));
    assert.ok(screen.getByRole("button", { name: "Aceitar convite de treinador" }));
    assert.equal(actionCtl.calls.length, 0);
  } finally {
    act(() => {
      useStudioStore.getState().setLocale("en");
    });
    cleanup();
  }
});

test("submitting form transitions to accepted state with /courses/admin link", async () => {
  actionCtl.calls = [];
  actionCtl.handler = async () => ({ status: "done", code: "accepted" });
  act(() => {
    useStudioStore.getState().setLocale("en");
  });

  try {
    const { container } = render(<InviteResult token="tok-accept" userEmail="coach@example.com" />);
    const form = container.querySelector("form");
    assert.ok(form, "confirmation card must render a form");
    fireEvent.submit(form);

    await waitFor(() => {
      assert.ok(screen.getByText("You are now a coach. Continue to the course admin."));
    });
    const link = screen.getByRole("link", { name: "Go to course admin" });
    assert.equal(link.getAttribute("href"), "/courses/admin");
    assert.deepEqual(actionCtl.calls, ["tok-accept"]);
  } finally {
    cleanup();
  }
});

test("submitting form renders error codes with role='alert'", async () => {
  actionCtl.calls = [];
  actionCtl.handler = async () => ({ status: "done", code: "rate_limited" });
  act(() => {
    useStudioStore.getState().setLocale("en");
  });

  try {
    const { container } = render(<InviteResult token="tok-err" userEmail="coach@example.com" />);
    const form = container.querySelector("form");
    assert.ok(form);
    fireEvent.submit(form);

    const alert = await screen.findByRole("alert");
    assert.match(alert.textContent ?? "", /Too many attempts/);
    assert.deepEqual(actionCtl.calls, ["tok-err"]);
  } finally {
    cleanup();
  }
});
