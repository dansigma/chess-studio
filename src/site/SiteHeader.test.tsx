import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Role } from "../lib/auth/roles.ts";

type AuthUserStub = {
  id: string;
  email: string;
  user_metadata?: { display_name?: string | null };
};

const ctl = {
  pushed: [] as string[],
  signOutCalls: 0,
  clientSignOutCalls: 0,
  roleCalls: 0,
  role: null as Role | null,
  roleRejects: false,
  reviewCount: 0,
  supabaseAvailable: false,
  authUser: null as AuthUserStub | null,
};

mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({
      push(href: string) {
        ctl.pushed.push(href);
      },
    }),
    usePathname: () => "/puzzles",
  },
});

mock.module("@/app/login/actions", {
  namedExports: {
    signOut: async () => {
      ctl.signOutCalls += 1;
    },
  },
});

mock.module("@/src/lib/supabase/client", {
  namedExports: {
    createBrowserSupabase: () => {
      if (!ctl.supabaseAvailable) {
        return null;
      }
      return {
        auth: {
          getUser: async () => ({ data: { user: ctl.authUser } }),
          signOut: async () => {
            ctl.clientSignOutCalls += 1;
            return { error: null };
          },
          onAuthStateChange: () => ({
            data: { subscription: { unsubscribe() {} } },
          }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            order: async () => ({ data: [], error: null }),
          }),
          upsert: async () => ({ error: null }),
        }),
      };
    },
  },
});

mock.module("@/src/courses/publish", {
  namedExports: {
    currentUserRole: async () => {
      ctl.roleCalls += 1;
      if (ctl.roleRejects) {
        throw new Error("role check failed");
      }
      return ctl.role;
    },
  },
});

mock.module("@/app/admin/courses/actions", {
  namedExports: {
    reviewQueueCountAction: async () => ({ ok: true as const, data: { count: ctl.reviewCount } }),
  },
});

const { SiteHeader } = await import("./SiteHeader.tsx");
const { useStudioStore } = await import("@/src/store/studio-store.ts");
const { DEFAULT_SETTINGS } = await import("@/src/store/slices/settings.ts");

before(() => setupDom());
after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  ctl.pushed.length = 0;
  ctl.signOutCalls = 0;
  ctl.clientSignOutCalls = 0;
  ctl.roleCalls = 0;
  ctl.role = null;
  ctl.roleRejects = false;
  ctl.reviewCount = 0;
  ctl.supabaseAvailable = false;
  ctl.authUser = null;
  act(() => {
    useStudioStore.setState({
      user: null,
      settings: { ...DEFAULT_SETTINGS, locale: "en" },
    });
  });
});

function selectInDialogRow(dialog: HTMLElement, label: string): HTMLSelectElement {
  const labelNode = Array.from(dialog.querySelectorAll("span")).find((el) => el.textContent === label);
  assert.ok(labelNode, `expected row label ${label}`);
  const select = labelNode.parentElement?.querySelector("select");
  assert.ok(select, `expected select next to ${label}`);
  return select;
}

test("signed out: renders section links, Settings button and Sign in trigger in both locales", async () => {
  render(<SiteHeader admin={false} isAdmin={false} />);

  const links = screen.getByRole("navigation").querySelectorAll("a");
  assert.deepEqual(
    Array.from(links).map((a) => a.textContent),
    ["Courses", "Puzzles", "Studio"],
  );
  assert.equal(screen.getByRole("link", { name: "Puzzles" }).getAttribute("aria-current"), "page");

  const settingsBtn = screen.getByRole("button", { name: "Settings" });
  assert.ok(settingsBtn);

  const signInBtn = screen.getByRole("button", { name: "Sign in" });
  fireEvent.click(signInBtn);
  assert.deepEqual(ctl.pushed, ["/login"]);

  act(() => {
    useStudioStore.getState().setLocale("pt-br");
  });

  await screen.findByRole("link", { name: "Exercícios" });
  assert.ok(screen.getByRole("link", { name: "Cursos" }));
  assert.ok(screen.getByRole("button", { name: "Configurações" }));
  assert.ok(screen.getByRole("button", { name: "Entrar" }));
});

test("Settings button opens SettingsDialog on demand and updates store immediately", () => {
  render(<SiteHeader admin={false} isAdmin={false} />);
  assert.equal(screen.queryByRole("dialog"), null);

  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  const dialog = screen.getByRole("dialog");
  assert.ok(screen.getByRole("heading", { name: "Settings" }));

  fireEvent.change(selectInDialogRow(dialog, "Color scheme"), { target: { value: "light" } });
  assert.equal(useStudioStore.getState().settings.colorScheme, "light");

  fireEvent.change(selectInDialogRow(dialog, "Board theme"), { target: { value: "green" } });
  assert.equal(useStudioStore.getState().settings.boardTheme, "green");

  fireEvent.change(selectInDialogRow(dialog, "Piece set"), { target: { value: "staunty" } });
  assert.equal(useStudioStore.getState().settings.pieceSet, "staunty");

  fireEvent.click(screen.getByRole("switch", { name: "Move sound" }));
  assert.equal(useStudioStore.getState().settings.moveSound, true);

  fireEvent.change(selectInDialogRow(dialog, "Site language"), { target: { value: "pt-br" } });
  assert.equal(useStudioStore.getState().settings.locale, "pt-br");
  assert.ok(screen.getByRole("link", { name: "Exercícios" }));
  assert.ok(screen.getByRole("button", { name: "Entrar" }));

  fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
  assert.equal(screen.queryByRole("dialog"), null);
});

test("signed in: shows initials avatar, opens account menu without Studio-only items, opens Settings, and signs out", async () => {
  act(() => {
    useStudioStore.setState({
      user: { id: "u1", email: "danvalves@example.com", displayName: "Danilo Alves" },
    });
  });

  render(<SiteHeader admin={false} isAdmin={false} />);
  const chip = screen.getByRole("button", { name: "Account: Danilo Alves (danvalves@example.com)" });
  assert.equal(chip.getAttribute("title"), "Danilo Alves · danvalves@example.com");
  assert.equal(chip.textContent, "DA");

  fireEvent.click(chip);
  assert.ok(screen.getByText("Danilo Alves", { selector: "div" }));
  assert.ok(screen.getByText("danvalves@example.com", { selector: "div" }));
  assert.equal(screen.queryByRole("menuitem", { name: /My boards/ }), null);
  assert.equal(screen.queryByText(/All boards synced|waiting to sync/), null);

  fireEvent.click(screen.getByRole("menuitem", { name: "Settings…" }));
  assert.ok(screen.getByRole("dialog"));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  assert.equal(screen.queryByRole("dialog"), null);

  fireEvent.click(chip);
  fireEvent.keyDown(window, { key: "Escape" });
  assert.equal(screen.queryByRole("menu"), null);

  fireEvent.click(chip);
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  await waitFor(() => assert.equal(ctl.signOutCalls, 1));
  assert.equal(useStudioStore.getState().user, null);
});

test("hydrates signed-in user from browser supabase session on pages outside Studio", async () => {
  ctl.supabaseAvailable = true;
  ctl.authUser = {
    id: "u2",
    email: "ana@example.com",
    user_metadata: { display_name: "Ana Lima" },
  };
  ctl.role = "student";

  render(<SiteHeader />);
  const chip = await screen.findByRole("button", { name: "Account: Ana Lima (ana@example.com)" });
  assert.equal(chip.textContent, "AL");
  assert.equal(useStudioStore.getState().user?.id, "u2");
});

test("uses SSR admin hints directly when provided without running client role lookup", () => {
  render(<SiteHeader admin isAdmin reviewCount={4} />);
  assert.equal(ctl.roleCalls, 0);
  assert.ok(screen.getByRole("link", { name: "Admin" }));
  assert.ok(screen.getByRole("link", { name: /Course review/ }));
  assert.ok(screen.getByLabelText("4 courses waiting for review"));
  assert.ok(screen.getByRole("link", { name: "Create course" }));
});

test("prop-less SiteHeader hydrates admin links and review badge for admins", async () => {
  ctl.role = "admin";
  ctl.reviewCount = 2;

  render(<SiteHeader />);
  await screen.findByRole("link", { name: "Admin" });
  assert.ok(screen.getByRole("link", { name: /Course review/ }));
  assert.ok(await screen.findByLabelText("2 courses waiting for review"));
  assert.ok(screen.getByRole("link", { name: "Create course" }));
});

test("prop-less SiteHeader hydrates Create course only for coaches", async () => {
  ctl.role = "coach";

  render(<SiteHeader />);
  await screen.findByRole("link", { name: "Create course" });
  assert.equal(screen.queryByRole("link", { name: "Admin" }), null);
  assert.equal(screen.queryByRole("link", { name: /Course review/ }), null);
});

test("partial admin prop still hydrates isAdmin client-side", async () => {
  ctl.role = "admin";
  ctl.reviewCount = 3;

  render(<SiteHeader admin />);
  assert.ok(screen.getByRole("link", { name: "Create course" }));
  await screen.findByRole("link", { name: "Admin" });
  assert.ok(await screen.findByLabelText("3 courses waiting for review"));
});

test("header keeps a single 48px non-wrapping row with internal nav scrolling for 390px viewports", () => {
  render(<SiteHeader admin isAdmin reviewCount={2} />);
  const header = screen.getByRole("banner");
  const nav = screen.getByRole("navigation");
  const rightControls = screen.getByRole("button", { name: "Settings" }).parentElement;

  assert.ok(header.className.includes("h-12"));
  assert.ok(!header.className.includes("flex-wrap"));
  assert.ok(nav.className.includes("min-w-0"));
  assert.ok(nav.className.includes("flex-1"));
  assert.ok(nav.className.includes("overflow-x-auto"));
  assert.ok(nav.className.includes("whitespace-nowrap"));
  assert.ok(rightControls?.className.includes("ml-auto"));
  assert.ok(rightControls?.className.includes("shrink-0"));
});
