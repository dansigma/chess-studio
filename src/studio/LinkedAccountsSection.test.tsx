import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LinkedAccount, LinkedAccountSource, LinkedAccountsResult } from "@/src/lib/my-games/linked-accounts";

let loadedAccounts: LinkedAccount[] = [];
const saveCalls: Array<{ source: LinkedAccountSource; username: string }> = [];
const removeCalls: LinkedAccountSource[] = [];

mock.module("@/src/lib/supabase/client", {
  namedExports: {
    createBrowserSupabase: () => ({}),
  },
});

mock.module("@/src/lib/my-games/linked-accounts", {
  namedExports: {
    loadLinkedAccounts: async (): Promise<LinkedAccountsResult> => ({
      ok: true,
      accounts: loadedAccounts,
    }),
    saveLinkedAccount: async (_client: unknown, source: LinkedAccountSource, username: string): Promise<LinkedAccountsResult> => {
      saveCalls.push({ source, username });
      const trimmed = username.trim();
      loadedAccounts = [
        ...loadedAccounts.filter((item) => item.source !== source),
        { source, username: trimmed, lastSyncedAt: null },
      ];
      return { ok: true, accounts: loadedAccounts };
    },
    removeLinkedAccount: async (_client: unknown, source: LinkedAccountSource): Promise<LinkedAccountsResult> => {
      removeCalls.push(source);
      loadedAccounts = loadedAccounts.filter((item) => item.source !== source);
      return { ok: true, accounts: loadedAccounts };
    },
  },
});

const { LinkedAccountsSection } = await import("./LinkedAccountsSection.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(() => teardownDom());

function seed(user: { id: string; email: string } | null, locale: "en" | "pt-br" = "en") {
  act(() => {
    useStudioStore.setState({ user, settings: { ...DEFAULT_SETTINGS, locale } });
  });
}

beforeEach(() => {
  loadedAccounts = [];
  saveCalls.length = 0;
  removeCalls.length = 0;
});

afterEach(() => {
  cleanup();
});

test("hidden when signed out", () => {
  seed(null);
  const { container } = render(<LinkedAccountsSection />);
  assert.equal(container.innerHTML, "");
});

test("disables Save when empty or unchanged and ignores submit while unchanged", async () => {
  loadedAccounts = [{ source: "lichess", username: "hikaru", lastSyncedAt: null }];
  seed({ id: "u1", email: "a@b.com" });
  render(<LinkedAccountsSection />);

  const lichessInput = (await screen.findByLabelText("Lichess")) as HTMLInputElement;
  const chesscomInput = screen.getByLabelText("Chess.com") as HTMLInputElement;
  assert.equal(lichessInput.value, "hikaru");
  assert.equal(chesscomInput.value, "");

  const lichessForm = lichessInput.closest("form")!;
  const chesscomForm = chesscomInput.closest("form")!;
  assert.ok(lichessForm);
  assert.ok(chesscomForm);

  const lichessSave = lichessForm.querySelector('button[type="submit"]') as HTMLButtonElement;
  const chesscomSave = chesscomForm.querySelector('button[type="submit"]') as HTMLButtonElement;
  const lichessRemove = lichessForm.querySelector('button[type="button"]') as HTMLButtonElement;
  assert.equal(lichessSave.disabled, true);
  assert.equal(chesscomSave.disabled, true);
  assert.ok(lichessRemove);

  // Trimmed unchanged value keeps Save disabled and submitting does nothing.
  fireEvent.change(lichessInput, { target: { value: "  hikaru  " } });
  assert.equal(lichessSave.disabled, true);
  fireEvent.submit(lichessForm);
  fireEvent.submit(chesscomForm);
  assert.deepEqual(saveCalls, []);
});

test("submitting the row form (Enter) saves when username changed", async () => {
  loadedAccounts = [{ source: "lichess", username: "hikaru", lastSyncedAt: null }];
  seed({ id: "u1", email: "a@b.com" });
  render(<LinkedAccountsSection />);

  const lichessInput = (await screen.findByLabelText("Lichess")) as HTMLInputElement;
  const lichessForm = lichessInput.closest("form")!;
  const lichessSave = lichessForm.querySelector('button[type="submit"]') as HTMLButtonElement;

  fireEvent.change(lichessInput, { target: { value: "magnus" } });
  assert.equal(lichessSave.disabled, false);

  fireEvent.submit(lichessForm);
  await waitFor(() => assert.deepEqual(saveCalls, [{ source: "lichess", username: "magnus" }]));

  // After save resolves, the row remounts with the new initialUsername and Save is disabled again.
  await waitFor(() => {
    const updatedInput = screen.getByLabelText("Lichess") as HTMLInputElement;
    const updatedSave = updatedInput.closest("form")!.querySelector('button[type="submit"]') as HTMLButtonElement;
    assert.equal(updatedInput.value, "magnus");
    assert.equal(updatedSave.disabled, true);
  });
});

test("remove button stays type=button and removes without submitting", async () => {
  loadedAccounts = [{ source: "lichess", username: "hikaru", lastSyncedAt: null }];
  seed({ id: "u1", email: "a@b.com" });
  render(<LinkedAccountsSection />);

  const removeButton = (await screen.findByRole("button", { name: "Remove" })) as HTMLButtonElement;
  assert.equal(removeButton.type, "button");
  fireEvent.click(removeButton);

  await waitFor(() => assert.deepEqual(removeCalls, ["lichess"]));
  assert.deepEqual(saveCalls, []);
});
