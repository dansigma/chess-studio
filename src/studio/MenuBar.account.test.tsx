// SIG-1216: account chip + menu header with and without a display name.
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

mock.module("next/navigation", {
  namedExports: { useRouter: () => ({ push() {} }), usePathname: () => "/studio" },
});
mock.module("@/app/login/actions", { namedExports: { signOut: async () => {} } });
mock.module("@/src/lib/supabase/client", { namedExports: { createBrowserSupabase: () => null } });

const { MenuBar } = await import("./MenuBar.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});

function seed(displayName: string | null) {
  act(() => {
    useStudioStore.setState({
      user: { id: "u1", email: "danvalves@example.com", displayName },
      settings: { ...DEFAULT_SETTINGS, locale: "en" },
    });
  });
}

beforeEach(() => cleanup());

test("with a name: name initials, tooltip, aria-label and two-line header", () => {
  seed("Danilo Alves");
  render(<MenuBar onOpenPgn={() => {}} />);
  const chip = screen.getByRole("button", { name: "Account: Danilo Alves (danvalves@example.com)" });
  assert.equal(chip.getAttribute("title"), "Danilo Alves · danvalves@example.com");
  assert.equal(chip.textContent, "DA");
  fireEvent.click(chip);
  const name = screen.getByText("Danilo Alves", { selector: "div" });
  const email = screen.getByText("danvalves@example.com", { selector: "div" });
  assert.ok(name.className.includes("font-medium"));
  assert.ok(email.className.includes("text-caption"));
  assert.ok(email.className.includes("text-studio-muted"));
});

test("without a name: e-mail initials, tooltip and header unchanged", () => {
  seed(null);
  render(<MenuBar onOpenPgn={() => {}} />);
  const chip = screen.getByRole("button", { name: "Account: danvalves@example.com" });
  assert.equal(chip.getAttribute("title"), "danvalves@example.com");
  assert.equal(chip.textContent, "DA");
  fireEvent.click(chip);
  const header = screen.getByText("danvalves@example.com", { selector: "div" });
  assert.ok(header.className.includes("font-medium"));
});
