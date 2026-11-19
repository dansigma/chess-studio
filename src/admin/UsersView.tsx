"use client";

import { useState } from "react";
import { changeRoleAction, listUsersAction, type AdminUsersCode } from "@/app/admin/users/actions";
import { createInviteAction, listInvitesAction, resendInviteAction, revokeInviteAction, type InviteActionCode } from "@/app/admin/users/invite-actions";
import type { CoachInviteRow } from "@/src/lib/admin/coach-invites";
import type { SiteLocale } from "@/src/i18n/locale";
import type { AdminListUser } from "@/src/admin/user-list";
import { ADMIN_USERS_PAGE_SIZE } from "@/src/admin/user-list";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Badge, SearchInput } from "@/src/studio/ui/Controls";
import { Dialog } from "@/src/studio/ui/Dialog";
import { Panel } from "@/src/studio/ui/Panel";
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

const ERROR_ALERT_CLASS =
  "rounded-lg border border-studio-danger/30 bg-studio-danger/10 px-3 py-2 text-dense text-studio-danger";
const FIELD_INPUT_CLASS =
  "h-9 w-full rounded-lg border border-studio-border-strong bg-studio-chrome px-3 text-body text-studio-fg outline-none placeholder:text-studio-faint focus:border-studio-accent";
const TABLE_HEADER_CELL_CLASS = "whitespace-nowrap px-3 py-2 font-medium";
const TABLE_CELL_CLASS = "px-3 py-2.5";

function roleLabel(locale: SiteLocale, role: string): string {
  const match = ROLE_OPTIONS.find((option) => option.value === role);
  return match ? tAdminUsers(locale, match.labelKey) : role;
}

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
  const [invitesLoading, setInvitesLoading] = useState(false);
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
    setInvitesLoading(true);
    setInviteError(null);
    try {
      const result = await listInvitesAction();
      if (!result.ok) {
        setInviteError(result.code);
        return;
      }
      setInvites(result.data.invites);
      setInvitesLoaded(true);
    } finally {
      setInvitesLoading(false);
    }
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-studio-fg">
          {tAdminUsers(locale, "admin.users.heading")}
        </h1>
        <p className="mt-1 text-body text-studio-muted">{tAdminUsers(locale, "admin.users.intro")}</p>
      </div>
      <Panel as="section" className="border border-studio-border p-4 sm:p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(1);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-caption font-medium text-studio-muted">
              {tAdminUsers(locale, "admin.users.searchLabel")}
            </span>
            <SearchInput
              value={search}
              onChange={setSearch}
              label={tAdminUsers(locale, "admin.users.searchLabel")}
              placeholder={tAdminUsers(locale, "admin.users.searchPlaceholder")}
              clearLabel={tAdminUsers(locale, "admin.users.searchClear")}
              className="w-full"
            />
          </div>
          <label className="flex flex-col gap-1 text-caption font-medium text-studio-muted">
            {tAdminUsers(locale, "admin.users.roleFilterLabel")}
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="h-[30px] rounded-md border border-studio-border-strong bg-studio-chrome px-2.5 text-dense text-studio-fg outline-none focus:border-studio-accent"
            >
              <option value="">{tAdminUsers(locale, "admin.users.roleAll")}</option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {tAdminUsers(locale, option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {tAdminUsers(locale, "admin.users.searchSubmit")}
          </Button>
        </form>
        {errorCode ? (
          <p role="alert" className={`mt-4 ${ERROR_ALERT_CLASS}`}>
            {tAdminUsers(locale, adminUsersErrorKey(errorCode))}
          </p>
        ) : null}
        {users.length === 0 ? (
          <p className="mt-4 text-body text-studio-muted">{tAdminUsers(locale, "admin.users.table.empty")}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-body">
              <thead>
                <tr className="border-b border-studio-border text-caption text-studio-muted">
                  <th className={TABLE_HEADER_CELL_CLASS}>{tAdminUsers(locale, "admin.users.table.email")}</th>
                  <th className={TABLE_HEADER_CELL_CLASS}>{tAdminUsers(locale, "admin.users.table.role")}</th>
                  <th className={TABLE_HEADER_CELL_CLASS}>{tAdminUsers(locale, "admin.users.table.created")}</th>
                  <th className={TABLE_HEADER_CELL_CLASS}>{tAdminUsers(locale, "admin.users.table.confirmed")}</th>
                  <th className={TABLE_HEADER_CELL_CLASS}>
                    <span className="sr-only">{tAdminUsers(locale, "admin.users.table.changeRole")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-studio-border">
                {users.map((user) => {
                  const own = !canChangeRole(user.id, currentUserId);
                  return (
                    <tr key={user.id} className="hover:bg-studio-hover-subtle">
                      <td className={`${TABLE_CELL_CLASS} text-studio-fg`}>{user.email}</td>
                      <td className={TABLE_CELL_CLASS}>
                        <Badge tone={user.role === "admin" ? "accent" : "neutral"}>
                          {roleLabel(locale, user.role)}
                        </Badge>
                      </td>
                      <td className={`${TABLE_CELL_CLASS} whitespace-nowrap tabular-nums text-studio-muted`}>
                        {user.created_at}
                      </td>
                      <td className={`${TABLE_CELL_CLASS} text-studio-muted`}>
                        {user.email_confirmed
                          ? tAdminUsers(locale, "admin.users.table.confirmedYes")
                          : tAdminUsers(locale, "admin.users.table.confirmedNo")}
                      </td>
                      <td className={`${TABLE_CELL_CLASS} whitespace-nowrap text-right`}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={own}
                          title={own ? tAdminUsers(locale, "admin.users.table.ownRow") : undefined}
                          onClick={() => openDialog(user)}
                        >
                          {tAdminUsers(locale, "admin.users.table.changeRole")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-studio-border pt-4 text-dense text-studio-muted">
          <span className="tabular-nums">
            {tAdminUsers(locale, "admin.users.paging.page", { page, pages })} ·{" "}
            {tAdminUsers(locale, "admin.users.paging.total", { total })}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={pending || page <= 1} onClick={() => void runSearch(page - 1)}>
              {tAdminUsers(locale, "admin.users.paging.prev")}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={pending || page >= pages} onClick={() => void runSearch(page + 1)}>
              {tAdminUsers(locale, "admin.users.paging.next")}
            </Button>
          </div>
        </div>
      </Panel>
      {dialogUser ? (
        <Dialog
          title={tAdminUsers(locale, "admin.users.dialog.title", { email: dialogUser.email })}
          onClose={() => setDialogUser(null)}
          footer={
            <>
              <Button type="button" variant="secondary" disabled={dialogPending} onClick={() => setDialogUser(null)}>
                {tAdminUsers(locale, "admin.users.dialog.cancel")}
              </Button>
              <Button type="button" variant="primary" disabled={dialogPending} onClick={() => void submitDialog()}>
                {tAdminUsers(locale, "admin.users.dialog.confirm")}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block text-caption font-medium text-studio-muted">
              {tAdminUsers(locale, "admin.users.dialog.roleLabel")}
              <select
                value={dialogRole}
                onChange={(event) => setDialogRole(event.target.value)}
                className={`mt-1 ${FIELD_INPUT_CLASS}`}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {tAdminUsers(locale, option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-caption font-medium text-studio-muted">
              {tAdminUsers(locale, "admin.users.dialog.reasonLabel")}
              <textarea
                rows={3}
                value={dialogReason}
                onChange={(event) => setDialogReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-studio-border-strong bg-studio-chrome px-3 py-2 text-body text-studio-fg outline-none placeholder:text-studio-faint focus:border-studio-accent"
              />
            </label>
            <p className="text-caption text-studio-faint">{tAdminUsers(locale, "admin.users.dialog.reasonHint")}</p>
            {dialogError ? (
              <p role="alert" className={ERROR_ALERT_CLASS}>
                {tAdminUsers(locale, adminUsersErrorKey(dialogError))}
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      <Panel as="section" className="border border-studio-border p-4 sm:p-6">
        <h2 className="text-title font-semibold text-studio-fg">{tAdminUsers(locale, "admin.invites.heading")}</h2>
        <p className="mt-1 text-body text-studio-muted">{tAdminUsers(locale, "admin.invites.intro")}</p>
        <form onSubmit={(event) => void submitInvite(event)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-caption font-medium text-studio-muted">
            {tAdminUsers(locale, "admin.invites.emailLabel")}
            <input
              type="email"
              required
              value={inviteEmail}
              placeholder={tAdminUsers(locale, "admin.invites.emailPlaceholder")}
              onChange={(event) => setInviteEmail(event.target.value)}
              className={FIELD_INPUT_CLASS}
            />
          </label>
          <Button type="submit" variant="primary" size="md" disabled={invitePending}>
            {tAdminUsers(locale, "admin.invites.submit")}
          </Button>
        </form>
        {inviteLink ? (
          <div className="mt-4 space-y-2 rounded-lg border border-studio-border bg-studio-chrome p-3">
            <p className="text-dense font-medium text-studio-fg">{tAdminUsers(locale, "admin.invites.createdLink")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                readOnly
                value={inviteLink.link}
                aria-label={tAdminUsers(locale, "admin.invites.createdLink")}
                className="h-8 min-w-0 flex-1 rounded-md border border-studio-border-strong bg-studio-panel px-2.5 font-mono text-dense text-studio-fg outline-none"
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyInviteLink()}>
                {inviteCopied ? tAdminUsers(locale, "admin.invites.copied") : tAdminUsers(locale, "admin.invites.copy")}
              </Button>
            </div>
            <p className="text-caption text-studio-muted">
              {tAdminUsers(locale, "admin.invites.expires", { expiresAt: inviteLink.expiresAt })}
            </p>
          </div>
        ) : null}
        {inviteError ? (
          <p role="alert" className={`mt-4 ${ERROR_ALERT_CLASS}`}>
            {tAdminUsers(locale, inviteActionErrorKey(inviteError))}
          </p>
        ) : null}
        <div className="mt-6 border-t border-studio-border pt-4">
          <h3 className="text-body font-semibold text-studio-fg">
            {tAdminUsers(locale, "admin.invites.pendingHeading")}
          </h3>
          {!invitesLoaded ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                disabled={invitesLoading || inviteActionPending}
                onClick={() => void refreshInvites()}
              >
                {tAdminUsers(locale, "admin.invites.loadPending")}
              </Button>
            </div>
          ) : pendingInvites.length === 0 ? (
            <p className="mt-2 text-body text-studio-muted">{tAdminUsers(locale, "admin.invites.empty")}</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-body">
                <thead>
                  <tr className="border-b border-studio-border text-caption text-studio-muted">
                    <th className={TABLE_HEADER_CELL_CLASS}>{tAdminUsers(locale, "admin.invites.table.email")}</th>
                    <th className={TABLE_HEADER_CELL_CLASS}>{tAdminUsers(locale, "admin.invites.table.expires")}</th>
                    <th className={TABLE_HEADER_CELL_CLASS}>
                      <span className="sr-only">{tAdminUsers(locale, "admin.invites.revoke")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-studio-border">
                  {pendingInvites.map((invite) => (
                    <tr key={invite.id} className="hover:bg-studio-hover-subtle">
                      <td className={`${TABLE_CELL_CLASS} text-studio-fg`}>{invite.email}</td>
                      <td className={`${TABLE_CELL_CLASS} whitespace-nowrap tabular-nums text-studio-muted`}>
                        {invite.expiresAt}
                      </td>
                      <td className={`${TABLE_CELL_CLASS} whitespace-nowrap text-right`}>
                        <div className="inline-flex items-center gap-2">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={inviteActionPending}
                            onClick={() => void revokeInvite(invite.id)}
                          >
                            {tAdminUsers(locale, "admin.invites.revoke")}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={inviteActionPending}
                            onClick={() => void resendInvite(invite.id)}
                          >
                            {tAdminUsers(locale, "admin.invites.resend")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
