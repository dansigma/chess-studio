// SIG-1202: site navigation links shared by the mobile hamburger sheet.
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

let pathname = "/studio";

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ push() {} }), usePathname: () => pathname },
});

const { SiteNavLinks } = await import("./SiteNavLinks.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});
beforeEach(() => {
  cleanup();
  pathname = "/studio";
  act(() => {
    useStudioStore.setState({ workspaceView: "studio", settings: { ...DEFAULT_SETTINGS, locale: "en" } });
  });
});

function link(name: string) {
  return screen.getByRole("link", { name });
}

test("renders Courses, Puzzles and Studio links in siteSections order", () => {
  render(<SiteNavLinks />);
  const labels = screen.getAllByRole("link").map((a) => a.getAttribute("aria-label") ?? a.textContent);
  assert.deepEqual(labels, ["Courses", "Puzzles", "Studio"]);
  assert.equal(link("Courses").getAttribute("href"), "/courses");
  assert.equal(link("Puzzles").getAttribute("href"), "/puzzles");
  assert.equal(link("Studio").getAttribute("href"), "/studio");
});

test("Studio is current on /studio; Courses and Puzzles are not", () => {
  render(<SiteNavLinks />);
  assert.equal(link("Studio").getAttribute("aria-current"), "page");
  assert.equal(link("Courses").getAttribute("aria-current"), null);
  assert.equal(link("Puzzles").getAttribute("aria-current"), null);
});

test("Studio loses aria-current while the Library or Live view is open", () => {
  act(() => useStudioStore.getState().setWorkspaceView("library"));
  render(<SiteNavLinks />);
  assert.equal(link("Studio").getAttribute("aria-current"), null);
});

test("tapping Studio returns to the studio workspace and runs onNavigate", () => {
  let navigated = 0;
  act(() => useStudioStore.getState().setWorkspaceView("library"));
  render(<SiteNavLinks onNavigate={() => (navigated += 1)} />);
  fireEvent.click(link("Studio"));
  assert.equal(useStudioStore.getState().workspaceView, "studio");
  assert.equal(navigated, 1);
});

test("other links close the sheet without touching workspaceView", () => {
  let navigated = 0;
  act(() => useStudioStore.getState().setWorkspaceView("live"));
  render(<SiteNavLinks onNavigate={() => (navigated += 1)} />);
  fireEvent.click(link("Courses"));
  assert.equal(useStudioStore.getState().workspaceView, "live");
  assert.equal(navigated, 1);
});

test("active item follows the current path", () => {
  pathname = "/courses/intro";
  const { rerender } = render(<SiteNavLinks />);
  assert.equal(link("Courses").getAttribute("aria-current"), "page");
  assert.equal(link("Studio").getAttribute("aria-current"), null);
  pathname = "/puzzles";
  rerender(<SiteNavLinks />);
  assert.equal(link("Puzzles").getAttribute("aria-current"), "page");
  assert.equal(link("Courses").getAttribute("aria-current"), null);
});

test("labels follow the site locale (pt-br)", () => {
  act(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, locale: "pt-br" } }));
  render(<SiteNavLinks />);
  assert.ok(link("Cursos"));
  assert.ok(link("Exercícios"));
  assert.ok(link("Studio"));
});
