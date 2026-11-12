// SIG-1273: Library item active state in the activity bar.
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ push() {} }), usePathname: () => "/studio" },
});

const { ActivityBar } = await import("./ActivityBar.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});
beforeEach(() => {
  cleanup();
  act(() => {
    useStudioStore.setState({ workspaceView: "studio", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

test("Library button toggles the view and reflects the pressed state", () => {
  render(<ActivityBar />);
  const button = screen.getByRole("button", { name: "Library" });
  assert.equal(button.getAttribute("aria-pressed"), "false");
  fireEvent.click(button);
  assert.equal(useStudioStore.getState().workspaceView, "library");
  assert.equal(screen.getByRole("button", { name: "Library" }).getAttribute("aria-pressed"), "true");
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("Studio link returns to studio and is not current while in the Library", () => {
  render(<ActivityBar />);
  const studio = () => screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/studio")!;
  assert.equal(studio().getAttribute("aria-current"), "page");
  act(() => useStudioStore.getState().setWorkspaceView("library"));
  assert.equal(studio().getAttribute("aria-current"), null);
  fireEvent.click(studio());
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("labels are Biblioteca in pt-br", () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  render(<ActivityBar />);
  assert.ok(screen.getByRole("button", { name: "Biblioteca" }));
});

test("Live button toggles the view, is exclusive with Library, and Studio is not current", () => {
  render(<ActivityBar />);
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  fireEvent.click(screen.getByRole("button", { name: "Live" }));
  assert.equal(useStudioStore.getState().workspaceView, "live");
  assert.equal(screen.getByRole("button", { name: "Live" }).getAttribute("aria-pressed"), "true");
  assert.equal(screen.getByRole("button", { name: "Library" }).getAttribute("aria-pressed"), "false");
  const studio = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/studio")!;
  assert.equal(studio.getAttribute("aria-current"), null);
  fireEvent.click(screen.getByRole("button", { name: "Live" }));
  assert.equal(useStudioStore.getState().workspaceView, "studio");
});

test("Live label is Ao vivo in pt-br", () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  render(<ActivityBar />);
  assert.ok(screen.getByRole("button", { name: "Ao vivo" }));
});
