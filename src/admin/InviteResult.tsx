"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptCoachInviteAction, type AcceptInviteActionState } from "@/app/coach-invite/[token]/actions";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Panel } from "@/src/studio/ui/Panel";
import { coachInviteAcceptKey } from "./rules";
import { tAdminUsers } from "./strings";

const INITIAL_STATE: AcceptInviteActionState = { status: "idle" };

// SIG-1064 / SIG-1396: coach invite confirmation and accept result. GET only
// renders the confirmation card; acceptance runs through the Server Action on
// form submit so link scanners cannot consume the single-use token.
export function InviteResult({ token, userEmail }: { token: string; userEmail: string }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [state, formAction, pending] = useActionState(acceptCoachInviteAction.bind(null, token), INITIAL_STATE);

  if (state.status === "done") {
    if (state.code === "accepted") {
      return (
        <Panel as="section" className="border border-studio-border p-6">
          <h1 className="text-xl font-semibold tracking-tight text-studio-fg">
            {tAdminUsers(locale, "coach.invite.title")}
          </h1>
          <p className="mt-2 text-body text-studio-success">
            {tAdminUsers(locale, coachInviteAcceptKey(state.code))}
          </p>
          <Link
            href="/courses/admin"
            className="mt-5 inline-flex h-8 items-center justify-center rounded-lg bg-studio-accent-solid px-3.5 text-body font-medium text-studio-accent-fg hover:bg-studio-accent-hover"
          >
            {tAdminUsers(locale, "coach.invite.continue")}
          </Link>
        </Panel>
      );
    }
    return (
      <Panel as="section" className="border border-studio-border p-6">
        <h1 className="text-xl font-semibold tracking-tight text-studio-fg">
          {tAdminUsers(locale, "coach.invite.title")}
        </h1>
        <p
          role="alert"
          className="mt-4 rounded-lg border border-studio-danger/30 bg-studio-danger/10 px-3 py-2 text-body text-studio-danger"
        >
          {tAdminUsers(locale, coachInviteAcceptKey(state.code))}
        </p>
      </Panel>
    );
  }

  return (
    <Panel as="section" className="border border-studio-border p-6">
      <h1 className="text-xl font-semibold tracking-tight text-studio-fg">
        {tAdminUsers(locale, "coach.invite.title")}
      </h1>
      <p className="mt-2 text-body text-studio-muted">
        {userEmail
          ? tAdminUsers(locale, "coach.invite.confirmBody", { email: userEmail })
          : tAdminUsers(locale, "coach.invite.confirmBodyNoEmail")}
      </p>
      <form action={formAction} className="mt-5">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? tAdminUsers(locale, "coach.invite.accepting") : tAdminUsers(locale, "coach.invite.accept")}
        </Button>
      </form>
    </Panel>
  );
}
