// SIG-1216: Settings "Account" section: hidden signed out, prefilled, saves the
// trimmed name via auth.updateUser, empty clears with null, error keeps input.
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

type UpdateArgs = { data: { display_name: string | null } };
const updateCalls: UpdateArgs[] = [];
let updateResult: { error: Error | null } = { error: null };

mock.module("@/src/lib/supabase/client", {
  namedExports: {
    createBrowserSupabase: () => ({
      auth: {
        updateUser: async (args: UpdateArgs) => {
          updateCalls.push(args);
          return updateResult;
        },
      },
    }),
  },
});

const { AccountSection } = await import("./AccountSection.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});

function seed(user: { id: string; email: string; displayName?: string | null } | null, locale: "en" | "pt-br" = "en") {
  act(() => {
    useStudioStore.setState({ user, statusMessage: null, settings: { ...DEFAULT_SETTINGS, locale } });
  });
}

beforeEach(() => {
  cleanup();
  updateCalls.length = 0;
  updateResult = { error: null };
});

test("hidden when signed out", () => {
  seed(null);
  const { container } = render(<AccountSection />);
  assert.equal(container.innerHTML, "");
});

test("prefilled with the current name; save disabled while unchanged", () => {
  seed({ id: "u1", email: "a@b.com", displayName: "Danilo Alves" });
  render(<AccountSection />);
  const input = screen.getByLabelText("Name") as HTMLInputElement;
  assert.equal(input.value, "Danilo Alves");
  assert.equal(input.maxLength, 60);
  assert.equal((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled, true);
  assert.ok(screen.getByText("Shown in your account menu. Leave empty to use your e-mail initials."));
});

test("saves the trimmed name, updates the store and shows the status", async () => {
  seed({ id: "u1", email: "a@b.com", displayName: null });
  render(<AccountSection />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Danilo Alves  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => assert.equal(useStudioStore.getState().user?.displayName, "Danilo Alves"));
  assert.deepEqual(updateCalls, [{ data: { display_name: "Danilo Alves" } }]);
  assert.equal(useStudioStore.getState().statusMessage, "Name saved");
});

test("empty value clears the name with null (pt-BR status)", async () => {
  seed({ id: "u1", email: "a@b.com", displayName: "Danilo" }, "pt-br");
  render(<AccountSection />);
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
  await waitFor(() => assert.equal(useStudioStore.getState().user?.displayName, null));
  assert.deepEqual(updateCalls, [{ data: { display_name: null } }]);
  assert.equal(useStudioStore.getState().statusMessage, "Nome salvo");
});

test("error keeps the input value and reports the failure", async () => {
  updateResult = { error: new Error("boom") };
  seed({ id: "u1", email: "a@b.com", displayName: "Old" });
  render(<AccountSection />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New name" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Couldn't save your name. Try again.");
  assert.equal((screen.getByLabelText("Name") as HTMLInputElement).value, "New name");
  assert.equal(useStudioStore.getState().user?.displayName, "Old");
  assert.equal(useStudioStore.getState().statusMessage, "Couldn't save your name. Try again.");
});
