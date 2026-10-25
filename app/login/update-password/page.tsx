"use client";

import { FormEvent, startTransition, useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MIN_PASSWORD_LENGTH,
  isValidPassword,
  passwordLengthError,
  passwordRequirementHint,
} from "@/src/lib/auth/password";
import { tAuth, type AuthMessage } from "@/src/i18n/auth-strings";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { Button } from "@/src/studio/ui/Button";
import { useStudioStore } from "@/src/store/studio-store";
import { AuthField, AuthLayout, AuthMessage as AuthBanner, authInputClass } from "../AuthLayout";
import type { AuthFormState } from "../actions";
import { updatePassword } from "./actions";

type Message = { tone: "info" | "error" | "success"; text: string };

export default function UpdatePasswordPage() {
  const locale = useStudioStore((state) => state.settings.locale);
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState<AuthMessage | null>(null);
  const [state, formAction, busy] = useActionState(updatePassword, {} as AuthFormState);
  const [session, setSession] = useState<"checking" | "ready" | "missing">(supabase ? "checking" : "missing");

  useEffect(() => {
    if (!supabase) {
      return;
    }
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setSession(data.user ? "ready" : "missing");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (state.message) {
      router.push("/studio");
      router.refresh();
    }
  }, [state.message, router]);

  // Client-side checks are only a hint; the server action re-validates.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidPassword(password.trim())) {
      setClientError(passwordLengthError());
      return;
    }
    if (password.trim() !== confirm.trim()) {
      setClientError({ key: "auth.error.passwordMismatch" });
      return;
    }
    setClientError(null);
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const errorText = clientError
    ? tAuth(locale, clientError.key, clientError.vars)
    : state.error
      ? tAuth(locale, state.error.key, state.error.vars)
      : null;
  const message: Message | null = errorText
    ? { tone: "error", text: errorText }
    : state.message
      ? { tone: "success", text: tAuth(locale, state.message.key, state.message.vars) }
      : null;

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">{tAuth(locale, "auth.update.title")}</h1>
      <p className="mt-1.5 text-body text-studio-muted">{tAuth(locale, "auth.update.subtitle")}</p>

      {session === "missing" ? (
        <div className="mt-6 space-y-4">
          <AuthBanner tone="error">{tAuth(locale, "auth.update.invalidLink")}</AuthBanner>
          <Link
            href="/login"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-studio-accent text-body font-medium text-studio-accent-fg hover:bg-studio-accent-strong"
          >
            {tAuth(locale, "auth.update.back")}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <AuthField
            id="new-password"
            label={tAuth(locale, "auth.update.newPassword")}
            trailing={
              <span className="text-caption text-studio-faint">
                {tAuth(locale, passwordRequirementHint().key, passwordRequirementHint().vars)}
              </span>
            }
          >
            <input
              id="new-password"
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={authInputClass}
            />
          </AuthField>
          <AuthField id="confirm-password" label={tAuth(locale, "auth.update.confirmPassword")}>
            <input
              id="confirm-password"
              name="confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={authInputClass}
            />
          </AuthField>
          {message ? <AuthBanner tone={message.tone}>{message.text}</AuthBanner> : null}
          <Button type="submit" variant="primary" block disabled={busy || session !== "ready"} className="h-9">
            {session === "checking"
              ? tAuth(locale, "auth.update.checking")
              : busy
                ? tAuth(locale, "auth.update.saving")
                : tAuth(locale, "auth.update.submit")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
