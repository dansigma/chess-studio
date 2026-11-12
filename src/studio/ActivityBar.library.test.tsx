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

test("Live label is Ao Vivo in pt-br", () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  render(<ActivityBar />);
  assert.ok(screen.getByRole("button", { name: "Ao Vivo" }));
});

// SIG-1298: labels follow settings.sidebarCollapsed.
const NAV_ITEMS = ["Studio", "Courses", "Puzzles", "Search", "Open boards", "Databases", "Files", "Bookmarks", "My Games", "Library", "Live"];

function labelsFor(name: string) {
  return Array.from(document.querySelectorAll("[data-activity-label]")).filter((el) => el.textContent === name);
}

test("collapsed: labels are hidden and tooltips are present", () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en", sidebarCollapsed: true } }));
  render(<ActivityBar />);
  const labels = Array.from(document.querySelectorAll("[data-activity-label]"));
  assert.ok(labels.length >= NAV_ITEMS.length);
  assert.ok(labels.every((el) => el.getAttribute("data-activity-label") === "hidden" && el.className.includes("opacity-0")));
  assert.ok(document.querySelectorAll('[role="tooltip"]').length >= NAV_ITEMS.length);
  assert.ok(screen.getByRole("button", { name: "Expand sidebar" }));
});

test("expanded: every item shows a visible label and no tooltip", () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en", sidebarCollapsed: false } }));
  render(<ActivityBar />);
  for (const name of NAV_ITEMS) {
    const found = labelsFor(name);
    assert.equal(found.length, 1, `label for ${name}`);
    assert.equal(found[0].getAttribute("data-activity-label"), "visible");
  }
  assert.equal(labelsFor("Collapse sidebar").length, 1);
  assert.equal(document.querySelectorAll('[role="tooltip"]').length, 0);
  assert.ok(screen.getByRole("button", { name: "Library" }).getAttribute("aria-label"));
});

test("toggle switches between icon-only and labelled", () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "en", sidebarCollapsed: false } }));
  render(<ActivityBar />);
  fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  assert.equal(useStudioStore.getState().settings.sidebarCollapsed, true);
  assert.equal(labelsFor("Library")[0].getAttribute("data-activity-label"), "hidden");
  fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
  assert.equal(labelsFor("Library")[0].getAttribute("data-activity-label"), "visible");
});

// SIG-1300: icon and label share one text colour rule across links and buttons.
test("inactive link and button share the label colour; active item uses text-studio-fg", () => {
  render(<ActivityBar />);
  const labelWrapper = (el: Element) => el.closest("a, button")!;
  const courses = labelWrapper(screen.getByRole("link", { name: "Courses" }));
  const files = labelWrapper(screen.getByRole("button", { name: "Files" }));
  const colour = (el: Element) => el.className.split(/\s+/).filter((c) => c.startsWith("text-studio-"));
  assert.deepEqual(colour(courses), ["text-studio-muted"]);
  assert.deepEqual(colour(files), ["text-studio-muted"]);
  assert.ok(courses.className.includes("hover:text-studio-fg"));
  assert.ok(files.className.includes("hover:text-studio-fg"));
  const studio = labelWrapper(screen.getByRole("link", { name: "Studio" }));
  assert.deepEqual(colour(studio), ["text-studio-fg"]);
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  assert.deepEqual(colour(screen.getByRole("button", { name: "Library" })), ["text-studio-fg"]);
});
