import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useStudioStore } from "../store/studio-store.ts";
import type { AdminListUser } from "./user-list.ts";
import type { CoachInviteRow } from "@/src/lib/admin/coach-invites.ts";

const ctl: {
  listUsersCalls: Array<{ search?: string; role?: string; page?: number }>;
  listUsersResult: { ok: true; data: { users: AdminListUser[]; total: number } };
  listInvitesHandler: () => Promise<{ ok: true; data: { invites: CoachInviteRow[] } }>;
} = {
  listUsersCalls: [],
  listUsersResult: { ok: true, data: { users: [], total: 0 } },
  listInvitesHandler: async () => ({ ok: true, data: { invites: [] } }),
};

mock.module("@/app/admin/users/actions.ts", {
  namedExports: {
    listUsersAction: async (input: { search?: string; role?: string; page?: number }) => {
      ctl.listUsersCalls.push(input);
      return ctl.listUsersResult;
    },
    changeRoleAction: async () => ({ ok: true as const, data: { oldRole: "student" } }),
  },
});

mock.module("@/app/admin/users/invite-actions.ts", {
  namedExports: {
    createInviteAction: async () => ({ ok: false as const, code: "unavailable" as const }),
    listInvitesAction: async () => ctl.listInvitesHandler(),
    resendInviteAction: async () => ({ ok: false as const, code: "unavailable" as const }),
    revokeInviteAction: async () => ({ ok: false as const, code: "unavailable" as const }),
  },
});

const { UsersView } = await import("./UsersView.tsx");

const USERS: AdminListUser[] = [
  {
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    created_at: "2026-01-01",
    email_confirmed: true,
    total: 3,
  },
  {
    id: "coach-1",
    email: "coach@example.com",
    role: "coach",
    created_at: "2026-01-02",
    email_confirmed: true,
    total: 3,
  },
  {
    id: "student-1",
    email: "student@example.com",
    role: "student",
    created_at: "2026-01-03",
    email_confirmed: false,
    total: 3,
  },
];

before(() => {
  setupDom();
});

after(async () => {
  await teardownDom();
});

beforeEach(() => {
  cleanup();
  ctl.listUsersCalls = [];
  ctl.listUsersResult = { ok: true, data: { users: USERS, total: USERS.length } };
  ctl.listInvitesHandler = async () => ({ ok: true, data: { invites: [] } });
  act(() => {
    useStudioStore.getState().setLocale("en");
  });
});

test("load-pending button label differs from heading in EN and PT-BR and disables while loading", async () => {
  let resolveInvites!: (value: { ok: true; data: { invites: CoachInviteRow[] } }) => void;
  ctl.listInvitesHandler = () =>
    new Promise((resolve) => {
      resolveInvites = resolve;
    });

  render(<UsersView initialUsers={USERS} initialTotal={USERS.length} currentUserId="admin-1" />);

  const enHeading = screen.getByRole("heading", { name: "Pending invites" });
  const enButton = screen.getByRole("button", { name: "Load pending invites" });
  assert.notEqual(enButton.textContent?.trim(), enHeading.textContent?.trim());
  assert.equal((enButton as HTMLButtonElement).disabled, false);

  act(() => {
    useStudioStore.getState().setLocale("pt-br");
  });

  const ptHeading = screen.getByRole("heading", { name: "Convites pendentes" });
  const ptButton = screen.getByRole("button", { name: "Carregar convites pendentes" });
  assert.notEqual(ptButton.textContent?.trim(), ptHeading.textContent?.trim());

  fireEvent.click(ptButton);
  assert.equal((ptButton as HTMLButtonElement).disabled, true);

  resolveInvites({ ok: true, data: { invites: [] } });
  await waitFor(() => {
    assert.ok(screen.getByText("Nenhum convite pendente."));
  });
});

test("user rows render localized role Badges with accent tone for admins", () => {
  render(<UsersView initialUsers={USERS} initialTotal={USERS.length} currentUserId="admin-1" />);

  const table = screen.getByRole("table");
  const rows = Array.from(table.querySelectorAll("tbody tr"));
  assert.equal(rows.length, 3);

  const adminBadge = rows[0]!.querySelector("td:nth-child(2) span");
  const coachBadge = rows[1]!.querySelector("td:nth-child(2) span");
  const studentBadge = rows[2]!.querySelector("td:nth-child(2) span");

  assert.equal(adminBadge?.textContent, "Admin");
  assert.match(adminBadge?.className ?? "", /bg-studio-accent-soft/);
  assert.equal(coachBadge?.textContent, "Coach");
  assert.match(coachBadge?.className ?? "", /bg-studio-hover-strong/);
  assert.equal(studentBadge?.textContent, "Student");
  assert.match(studentBadge?.className ?? "", /bg-studio-hover-strong/);
});

test("change-role dialog places Cancel and Change role actions in the Dialog footer", () => {
  render(<UsersView initialUsers={USERS} initialTotal={USERS.length} currentUserId="admin-1" />);

  const changeButtons = screen.getAllByRole("button", { name: "Change role" });
  // Row 0 is currentUserId ("admin-1"), so its button is disabled.
  assert.equal((changeButtons[0] as HTMLButtonElement).disabled, true);
  fireEvent.click(changeButtons[1]!);

  const dialog = screen.getByRole("dialog");
  const cancelBtn = screen.getByRole("button", { name: "Cancel" });
  const confirmBtn = dialog.querySelector("button:not([aria-label])")
    ? screen.getAllByRole("button", { name: "Change role" }).find((btn) => dialog.contains(btn))
    : undefined;

  assert.ok(confirmBtn, "expected Change role confirm button inside dialog");
  const footer = cancelBtn.parentElement!;
  assert.equal(confirmBtn!.parentElement, footer);
  assert.match(footer.className, /\bshrink-0\b/);
  assert.match(footer.className, /\bborder-t\b/);
  assert.ok(!footer.className.includes("overflow-y-auto"));
});

test("search via SearchInput submits query and role filter to listUsersAction", async () => {
  render(<UsersView initialUsers={USERS} initialTotal={USERS.length} currentUserId="admin-1" />);

  const searchInput = screen.getByRole("textbox", { name: "Search by email" });
  fireEvent.change(searchInput, { target: { value: "coach@example.com" } });
  const roleSelect = screen.getByRole("combobox", { name: "Role" });
  fireEvent.change(roleSelect, { target: { value: "coach" } });

  fireEvent.submit(searchInput.closest("form")!);

  await waitFor(() => {
    assert.equal(ctl.listUsersCalls.length, 1);
  });
  assert.deepEqual(ctl.listUsersCalls[0], {
    search: "coach@example.com",
    role: "coach",
    page: 1,
  });

  // SearchInput clear button clears the search field.
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  assert.equal((searchInput as HTMLInputElement).value, "");
});
