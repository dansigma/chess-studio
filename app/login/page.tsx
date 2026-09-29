"use client";

import { Suspense, useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { Button } from "@/src/studio/ui/Button";
import { submitAuth, type AuthFormState } from "./actions";
import { AuthField, AuthLayout, AuthMessage, authInputClass } from "./AuthLayout";

type Mode = "signin" | "signup" | "reset";

const HEADINGS: Record<Mode, { title: string; subtitle: string }> = {
  signin: { title: "Welcome back", subtitle: "Sign in to sync your boards, files and repertoires." },
  signup: { title: "Create an account", subtitle: "Save your analysis and pick up where you left off." },
  reset: { title: "Reset your password", subtitle: "We'll email you a link to choose a new password." },
};

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [state, formAction, pending] = useActionState(submitAuth, {} as AuthFormState);
  const supabase = createBrowserSupabase();

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
  }

  const heading = HEADINGS[mode];
  const submitLabel =
    mode === "reset" ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in";

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">{heading.title}</h1>
      <p className="mt-1.5 text-body text-studio-muted">{heading.subtitle}</p>

      {mode !== "reset" ? (
        <div role="tablist" className="mt-6 grid grid-cols-2 rounded-lg bg-studio-selected p-1">
          {(["signin", "signup"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              onClick={() => switchMode(tab)}
              className={`h-8 rounded-md text-dense font-medium transition-colors ${
                mode === tab ? "bg-studio-tab text-studio-fg shadow-sm" : "text-studio-muted hover:text-studio-fg"
              }`}
            >
              {tab === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next.startsWith("/") ? next : "/studio"} />
        {!supabase ? (
          <AuthMessage tone="info">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable accounts.
          </AuthMessage>
        ) : null}
        <AuthField id="email" label="Email">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={authInputClass}
          />
        </AuthField>
        {mode !== "reset" ? (
          <AuthField
            id="password"
            label="Password"
            trailing={
              mode === "signin" ? (
                <button
                  type="button"
                  className="text-dense font-normal text-studio-accent-text hover:underline"
                  onClick={() => switchMode("reset")}
                >
                  Forgot password?
                </button>
              ) : (
                <span className="text-caption font-normal text-studio-faint">At least 6 characters</span>
              )
            }
          >
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={authInputClass}
            />
          </AuthField>
        ) : null}
        {state.error ? <AuthMessage tone="error">{state.error}</AuthMessage> : null}
        {state.message ? <AuthMessage tone="success">{state.message}</AuthMessage> : null}
        <Button type="submit" variant="primary" block disabled={pending || !supabase} className="h-9">
          {pending ? "Please wait…" : submitLabel}
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-between text-dense">
        {mode === "reset" ? (
          <button type="button" className="text-studio-muted hover:text-studio-fg" onClick={() => switchMode("signin")}>
            ← Back to sign in
          </button>
        ) : (
          <span />
        )}
        <Link href="/studio" className="text-studio-muted hover:text-studio-fg">
          Continue as guest →
        </Link>
      </div>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
