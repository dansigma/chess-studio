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
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { Button } from "@/src/studio/ui/Button";
import { AuthField, AuthLayout, AuthMessage, authInputClass } from "../AuthLayout";
import type { AuthFormState } from "../actions";
import { updatePassword } from "./actions";

type Message = { tone: "info" | "error" | "success"; text: string };

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
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
      setClientError("Passwords don't match.");
      return;
    }
    setClientError(null);
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  const message: Message | null = clientError
    ? { tone: "error", text: clientError }
    : state.error
      ? { tone: "error", text: state.error }
      : state.message
        ? { tone: "success", text: state.message }
        : null;

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-body text-studio-muted">You&apos;ll use it the next time you sign in.</p>

      {session === "missing" ? (
        <div className="mt-6 space-y-4">
          <AuthMessage tone="error">
            This reset link is invalid or has expired. Request a new one from the sign-in page.
          </AuthMessage>
          <Link
            href="/login"
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-studio-accent text-body font-medium text-studio-accent-fg hover:bg-studio-accent-strong"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <AuthField
            id="new-password"
            label="New password"
            trailing={<span className="text-caption text-studio-faint">{passwordRequirementHint()}</span>}
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
          <AuthField id="confirm-password" label="Confirm password">
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
          {message ? <AuthMessage tone={message.tone}>{message.text}</AuthMessage> : null}
          <Button type="submit" variant="primary" block disabled={busy || session !== "ready"} className="h-9">
            {session === "checking" ? "Checking link…" : busy ? "Saving…" : "Update password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
