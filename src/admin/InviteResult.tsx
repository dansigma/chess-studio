"use client";

import Link from "next/link";
import { useStudioStore } from "@/src/store/studio-store";
import { coachInviteAcceptKey, type CoachInviteResultCode } from "./rules";
import { tAdminUsers } from "./strings";

// SIG-1064: coach invite accept result. The server page resolves the code;
// this client component only picks the localized message (the server never
// knows the site locale). Success links to /courses/admin.
export function InviteResult({ code }: { code: CoachInviteResultCode }) {
  const locale = useStudioStore((state) => state.settings.locale);
  if (code === "accepted") {
    return (
      <div>
        <h1>{tAdminUsers(locale, "coach.invite.title")}</h1>
        <p>{tAdminUsers(locale, coachInviteAcceptKey(code))}</p>
        <p>
          <Link href="/courses/admin">{tAdminUsers(locale, "coach.invite.success")}</Link>
        </p>
      </div>
    );
  }
  return (
    <div>
      <h1>{tAdminUsers(locale, "coach.invite.title")}</h1>
      <p role="alert">{tAdminUsers(locale, coachInviteAcceptKey(code))}</p>
    </div>
  );
}
