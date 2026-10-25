"use client";

import { useState } from "react";
import { changeRoleAction, listUsersAction, type AdminUsersCode } from "@/app/admin/users/actions";
import { createInviteAction, listInvitesAction, resendInviteAction, revokeInviteAction, type InviteActionCode } from "@/app/admin/users/invite-actions";
import type { CoachInviteRow } from "@/src/lib/admin/coach-invites";
import type { AdminListUser } from "@/src/admin/user-list";
import { ADMIN_USERS_PAGE_SIZE } from "@/src/admin/user-list";
import { useStudioStore } from "@/src/store/studio-store";
import { Dialog } from "@/src/studio/ui/Dialog";
import { adminUsersErrorKey, canChangeRole, inviteActionErrorKey, isInvitePending, isReasonValid } from "./rules";
import { tAdminUsers, type AdminUsersStringKey } from "./strings";

type UsersViewProps = {
  initialUsers: AdminListUser[];
  initialTotal: number;
  currentUserId: string;
};

const ROLE_OPTIONS = [
  { value: "student", labelKey: "admin.users.roleStudent" },
  { value: "coach", labelKey: "admin.users.roleCoach" },
  { value: "admin", labelKey: "admin.users.roleAdmin" },
] as const satisfies ReadonlyArray<{ value: string; labelKey: AdminUsersStringKey }>;

export function UsersView({ initialUsers, initialTotal, currentUserId }: UsersViewProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<AdminUsersCode | null>(null);
  const [dialogUser, setDialogUser] = useState<AdminListUser | null>(null);
  const [dialogRole, setDialogRole] = useState<string>("student");
  const [dialogReason, setDialogReason] = useState("");
  const [dialogPending, setDialogPending] = useState(false);
  const [dialogError, setDialogError] = useState<AdminUsersCode | null>(null);

  // SIG-1064: coach invites section state. The created link holds the raw
  // token and is kept in memory only — a refresh loses it by design, because
  // the list action never returns tokens or hashes.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<{ link: string; expiresAt: string } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<InviteActionCode | null>(null);
  const [invites, setInvites] = useState<CoachInviteRow[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [inviteActionPending, setInviteActionPending] = useState(false);

  const pages = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));

  async function runSearch(nextPage: number) {
    setPending(true);
    setErrorCode(null);
    const result = await listUsersAction({ search, role, page: nextPage });
    setPending(false);
    if (!result.ok) {
      setErrorCode(result.code);
      return;
    }
    setUsers(result.data.users);
    setTotal(result.data.total);
    setPage(nextPage);
  }

  function openDialog(user: AdminListUser) {
    setDialogUser(user);
    setDialogRole(user.role);
    setDialogReason("");
    setDialogError(null);
  }

  async function submitDialog() {
    if (!dialogUser) {
      return;
    }
    if (!isReasonValid(dialogReason)) {
      setDialogError("invalid_reason");
      return;
    }
    setDialogPending(true);
    setDialogError(null);
    const result = await changeRoleAction({
      userId: dialogUser.id,
      newRole: dialogRole,
      reason: dialogReason,
    });
    setDialogPending(false);
    if (!result.ok) {
      setDialogError(result.code);
      return;
    }
    setDialogUser(null);
    await runSearch(page);
  }

  async function refreshInvites() {
    const result = await listInvitesAction();
    if (!result.ok) {
      setInviteError(result.code);
      return;
    }
    setInvites(result.data.invites);
    setInvitesLoaded(true);
  }

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    setInvitePending(true);
    setInviteError(null);
    setInviteCopied(false);
    const result = await createInviteAction({ email: inviteEmail });
    setInvitePending(false);
    if (!result.ok) {
      setInviteError(result.code);
      return;
    }
    setInviteLink({ link: result.data.link, expiresAt: result.data.expiresAt });
    setInviteEmail("");
    await refreshInvites();
  }

  async function revokeInvite(id: string) {
    setInviteActionPending(true);
    setInviteError(null);
    const result = await revokeInviteAction({ id });
    setInviteActionPending(false);
    if (!result.ok) {
      setInviteError(result.code);
      return;
    }
    await refreshInvites();
  }

  async function resendInvite(id: string) {
    setInviteActionPending(true);
    setInviteError(null);
    setInviteCopied(false);
    const result = await resendInviteAction({ id });
    setInviteActionPending(false);
    if (!result.ok) {
      setInviteError(result.code);
      return;
    }
    setInviteLink({ link: result.data.link, expiresAt: result.data.expiresAt });
    await refreshInvites();
  }

  async function copyInviteLink() {
    if (!inviteLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(inviteLink.link);
      setInviteCopied(true);
    } catch {
      setInviteCopied(false);
    }
  }

  const pendingInvites = invites.filter((invite) => isInvitePending(invite));

  return (
    <div>
      <h1>{tAdminUsers(locale, "admin.users.heading")}</h1>
      <p>{tAdminUsers(locale, "admin.users.intro")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(1);
        }}
      >
        <label>
          {tAdminUsers(locale, "admin.users.searchLabel")}
          <input
            type="search"
            value={search}
            placeholder={tAdminUsers(locale, "admin.users.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          {tAdminUsers(locale, "admin.users.roleFilterLabel")}
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">{tAdminUsers(locale, "admin.users.roleAll")}</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {tAdminUsers(locale, option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending}>
          {tAdminUsers(locale, "admin.users.searchSubmit")}
        </button>
      </form>
      {errorCode ? <p role="alert">{tAdminUsers(locale, adminUsersErrorKey(errorCode))}</p> : null}
      {users.length === 0 ? (
        <p>{tAdminUsers(locale, "admin.users.table.empty")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{tAdminUsers(locale, "admin.users.table.email")}</th>
              <th>{tAdminUsers(locale, "admin.users.table.role")}</th>
              <th>{tAdminUsers(locale, "admin.users.table.created")}</th>
              <th>{tAdminUsers(locale, "admin.users.table.confirmed")}</th>
              <th>
                <span className="sr-only">{tAdminUsers(locale, "admin.users.table.changeRole")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const own = !canChangeRole(user.id, currentUserId);
              return (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.created_at}</td>
                  <td>
                    {user.email_confirmed
                      ? tAdminUsers(locale, "admin.users.table.confirmedYes")
                      : tAdminUsers(locale, "admin.users.table.confirmedNo")}
                  </td>
                  <td>
                    <button type="button" disabled={own} title={own ? tAdminUsers(locale, "admin.users.table.ownRow") : undefined} onClick={() => openDialog(user)}>
                      {tAdminUsers(locale, "admin.users.table.changeRole")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div>
        <button type="button" disabled={pending || page <= 1} onClick={() => void runSearch(page - 1)}>
          {tAdminUsers(locale, "admin.users.paging.prev")}
        </button>
        <span>
          {tAdminUsers(locale, "admin.users.paging.page", { page, pages })} ·{" "}
          {tAdminUsers(locale, "admin.users.paging.total", { total })}
        </span>
        <button type="button" disabled={pending || page >= pages} onClick={() => void runSearch(page + 1)}>
          {tAdminUsers(locale, "admin.users.paging.next")}
        </button>
      </div>
      {dialogUser ? (
        <Dialog title={tAdminUsers(locale, "admin.users.dialog.title", { email: dialogUser.email })} onClose={() => setDialogUser(null)}>
          <label>
            {tAdminUsers(locale, "admin.users.dialog.roleLabel")}
            <select value={dialogRole} onChange={(event) => setDialogRole(event.target.value)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tAdminUsers(locale, option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tAdminUsers(locale, "admin.users.dialog.reasonLabel")}
            <textarea value={dialogReason} onChange={(event) => setDialogReason(event.target.value)} />
          </label>
          <p>{tAdminUsers(locale, "admin.users.dialog.reasonHint")}</p>
          {dialogError ? <p role="alert">{tAdminUsers(locale, adminUsersErrorKey(dialogError))}</p> : null}
          <div>
            <button type="button" disabled={dialogPending} onClick={() => void submitDialog()}>
              {tAdminUsers(locale, "admin.users.dialog.confirm")}
            </button>
            <button type="button" disabled={dialogPending} onClick={() => setDialogUser(null)}>
              {tAdminUsers(locale, "admin.users.dialog.cancel")}
            </button>
          </div>
        </Dialog>
      ) : null}
      <section>
        <h2>{tAdminUsers(locale, "admin.invites.heading")}</h2>
        <p>{tAdminUsers(locale, "admin.invites.intro")}</p>
        <form onSubmit={(event) => void submitInvite(event)}>
          <label>
            {tAdminUsers(locale, "admin.invites.emailLabel")}
            <input
              type="email"
              required
              value={inviteEmail}
              placeholder={tAdminUsers(locale, "admin.invites.emailPlaceholder")}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </label>
          <button type="submit" disabled={invitePending}>
            {tAdminUsers(locale, "admin.invites.submit")}
          </button>
        </form>
        {inviteLink ? (
          <div>
            <p>{tAdminUsers(locale, "admin.invites.createdLink")}</p>
            <input type="text" readOnly value={inviteLink.link} aria-label={tAdminUsers(locale, "admin.invites.createdLink")} />
            <button type="button" onClick={() => void copyInviteLink()}>
              {inviteCopied ? tAdminUsers(locale, "admin.invites.copied") : tAdminUsers(locale, "admin.invites.copy")}
            </button>
            <p>{tAdminUsers(locale, "admin.invites.expires", { expiresAt: inviteLink.expiresAt })}</p>
          </div>
        ) : null}
        {inviteError ? <p role="alert">{tAdminUsers(locale, inviteActionErrorKey(inviteError))}</p> : null}
        <h3>{tAdminUsers(locale, "admin.invites.pendingHeading")}</h3>
        {!invitesLoaded ? (
          <button type="button" disabled={inviteActionPending} onClick={() => void refreshInvites()}>
            {tAdminUsers(locale, "admin.invites.pendingHeading")}
          </button>
        ) : pendingInvites.length === 0 ? (
          <p>{tAdminUsers(locale, "admin.invites.empty")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{tAdminUsers(locale, "admin.invites.table.email")}</th>
                <th>{tAdminUsers(locale, "admin.invites.table.expires")}</th>
                <th>
                  <span className="sr-only">{tAdminUsers(locale, "admin.invites.revoke")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td>{invite.expiresAt}</td>
                  <td>
                    <button type="button" disabled={inviteActionPending} onClick={() => void revokeInvite(invite.id)}>
                      {tAdminUsers(locale, "admin.invites.revoke")}
                    </button>
                    <button type="button" disabled={inviteActionPending} onClick={() => void resendInvite(invite.id)}>
                      {tAdminUsers(locale, "admin.invites.resend")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
