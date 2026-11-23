import assert from "node:assert/strict";
import test, { after, afterEach, mock } from "node:test";
import { teardownDom } from "../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push() {}, replace() {}, prefetch() {} }),
    usePathname: () => "/studio",
  },
});

mock.module("dockview-react", {
  namedExports: {
    DockviewDefaultTab: () => null,
    DockviewReact: () => <div data-testid="studio-dock" />,
    themeVisualStudio: {},
  },
});

const { StudioShell } = await import("./StudioShell");
const { useStudioStore } = await import("@/src/store/studio-store");
afterEach(cleanup);
after(teardownDom);

test("Studio renders the desktop chrome while the Library read is pending", () => {
  const hydrateLocalFiles = mock.fn(() => new Promise<void>(() => {}));
  useStudioStore.setState({ filesHydrated: false, hydrateLocalFiles });
  render(<StudioShell />);

  assert.equal(hydrateLocalFiles.mock.callCount(), 1);
  assert.equal(useStudioStore.getState().filesHydrated, false);
  assert.ok(screen.getByTestId("studio-dock"));
  assert.ok(screen.getByRole("group", { name: "Workspace" }));
  assert.equal(screen.queryByText("Loading your Library…"), null);
});
