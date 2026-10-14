"use client";

import { FormEvent, useEffect, useState } from "react";
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

type Message = { tone: "info" | "error" | "success"; text: string };

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      return;
    }
    if (!isValidPassword(password)) {
      setMessage({ tone: "error", text: passwordLengthError() });
      return;
    }
    if (password !== confirm) {
      setMessage({ tone: "error", text: "Passwords don't match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }
    setMessage({ tone: "success", text: "Password updated. Taking you to Studio…" });
    router.push("/studio");
    router.refresh();
  }

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
        <form onSubmit={(event) => void onSubmit(event)} className="mt-6 space-y-4">
          <AuthField
            id="new-password"
            label="New password"
            trailing={<span className="text-caption text-studio-faint">{passwordRequirementHint()}</span>}
          >
            <input
              id="new-password"
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
