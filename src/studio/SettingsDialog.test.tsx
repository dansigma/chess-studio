import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog.tsx";
import { clearReviewCache, getCachedReview, setCachedReview } from "./review/review-cache.ts";
import { useStudioStore } from "@/src/store/studio-store.ts";
import { DEFAULT_SETTINGS } from "@/src/store/slices/settings.ts";

before(() => setupDom());
after(() => teardownDom());

function seed(locale: "en" | "pt-br" = "en") {
  act(() => {
    useStudioStore.setState({
      user: null,
      settings: { ...DEFAULT_SETTINGS, locale },
    });
  });
}

beforeEach(() => {
  clearReviewCache();
});

afterEach(() => {
  cleanup();
  clearReviewCache();
});

test("SettingsDialog links every select to its row label via getByLabelText in EN", () => {
  seed("en");
  render(<SettingsDialog onClose={() => {}} />);

  const labels = [
    "Color scheme",
    "Board theme",
    "Piece set",
    "Stockfish",
    "Move notation",
    "Notation density",
    "Site language",
  ];
  const ids = new Set<string>();
  for (const label of labels) {
    const select = screen.getByLabelText(label);
    assert.equal(select.tagName, "SELECT");
    assert.ok(select.id.length > 0, `expected id on ${label} select`);
    ids.add(select.id);
  }
  assert.equal(ids.size, 7);

  fireEvent.change(screen.getByLabelText("Color scheme"), { target: { value: "light" } });
  fireEvent.change(screen.getByLabelText("Board theme"), { target: { value: "green" } });
  fireEvent.change(screen.getByLabelText("Piece set"), { target: { value: "staunty" } });
  fireEvent.change(screen.getByLabelText("Move notation"), { target: { value: "unicode" } });
  fireEvent.change(screen.getByLabelText("Notation density"), { target: { value: "compact" } });
  fireEvent.change(screen.getByLabelText("Site language"), { target: { value: "pt-br" } });

  const updated = useStudioStore.getState().settings;
  assert.equal(updated.colorScheme, "light");
  assert.equal(updated.boardTheme, "green");
  assert.equal(updated.pieceSet, "staunty");
  assert.equal(updated.moveNotation, "unicode");
  assert.equal(updated.notationDensity, "compact");
  assert.equal(updated.locale, "pt-br");
});

test("SettingsDialog links every select to its row label via getByLabelText in PT-BR", () => {
  seed("pt-br");
  render(<SettingsDialog onClose={() => {}} />);

  const labels = [
    "Esquema de cores",
    "Tema do tabuleiro",
    "Conjunto de peças",
    "Stockfish",
    "Notação de lances",
    "Densidade da notação",
    "Idioma do site",
  ];
  for (const label of labels) {
    const select = screen.getByLabelText(label);
    assert.equal(select.tagName, "SELECT");
  }
});

test("clear saved reviews requires inline two-step confirmation and preserves focus inside dialog", () => {
  seed("en");
  const rows = [] as Parameters<typeof setCachedReview>[1];
  setCachedReview("sample-review", rows);
  render(<SettingsDialog onClose={() => {}} />);

  const clearButton = screen.getByRole("button", { name: "Clear saved reviews" });
  fireEvent.click(clearButton);

  // First click does not clear yet; reveals Confirm (danger) + Cancel and focuses Confirm.
  assert.equal(getCachedReview("sample-review"), rows);
  const confirmButton = screen.getByRole("button", { name: "Confirm" });
  const cancelButton = screen.getByRole("button", { name: "Cancel" });
  assert.match(confirmButton.className, /text-studio-danger/);
  assert.match(confirmButton.className, /bg-studio-danger\/15/);
  assert.equal(document.activeElement, confirmButton);

  // Cancel restores the original button, keeps cache intact, and returns focus to it.
  fireEvent.click(cancelButton);
  assert.equal(getCachedReview("sample-review"), rows);
  assert.equal(screen.queryByRole("button", { name: "Confirm" }), null);
  const restoredClear = screen.getByRole("button", { name: "Clear saved reviews" });
  assert.equal(document.activeElement, restoredClear);

  // Confirm clears the cache, restores the button, and returns focus inside the dialog.
  fireEvent.click(restoredClear);
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  assert.equal(getCachedReview("sample-review"), null);
  assert.equal(screen.queryByRole("button", { name: "Confirm" }), null);
  assert.equal(document.activeElement, screen.getByRole("button", { name: "Clear saved reviews" }));
});

test("clear saved reviews confirmation renders localized labels in PT-BR", () => {
  seed("pt-br");
  render(<SettingsDialog onClose={() => {}} />);

  fireEvent.click(screen.getByRole("button", { name: "Limpar revisões salvas" }));
  assert.ok(screen.getByRole("button", { name: "Confirmar" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  assert.ok(screen.getByRole("button", { name: "Limpar revisões salvas" }));
});

test("initialSection='linkedAccounts' scrolls the Linked accounts section into view when signed in", () => {
  act(() => {
    useStudioStore.setState({
      user: { id: "u1", email: "user@example.com" },
      settings: { ...DEFAULT_SETTINGS, locale: "en" },
    });
  });

  const scrollCalls: Array<ScrollIntoViewOptions | boolean | undefined> = [];
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = function (arg?: ScrollIntoViewOptions | boolean) {
    if (this.tagName === "SECTION" && this.textContent?.includes("Linked accounts")) {
      scrollCalls.push(arg);
    }
  };

  try {
    render(<SettingsDialog onClose={() => {}} initialSection="linkedAccounts" />);
    assert.equal(scrollCalls.length, 1);
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("initialSection='linkedAccounts' is safe when scrollIntoView is unavailable", () => {
  act(() => {
    useStudioStore.setState({
      user: { id: "u1", email: "user@example.com" },
      settings: { ...DEFAULT_SETTINGS, locale: "en" },
    });
  });

  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  // Simulate an environment like happy-dom without scrollIntoView.
  (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView = undefined;

  try {
    render(<SettingsDialog onClose={() => {}} initialSection="linkedAccounts" />);
    assert.ok(screen.getByRole("heading", { name: "Linked accounts" }));
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});
