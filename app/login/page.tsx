"use client";

import { Suspense, useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { tAuth, type AuthMessage as AuthFormMessage, type AuthStringKey } from "@/src/i18n/auth-strings";
import { MIN_PASSWORD_LENGTH, passwordRequirementHint } from "@/src/lib/auth/password";
import { oauthRedirectTo } from "@/src/lib/auth/oauth";
import { safeAuthNext } from "@/src/lib/auth/redirect-path";
import { Button } from "@/src/studio/ui/Button";
import { useStudioStore } from "@/src/store/studio-store";
import { submitAuth, type AuthFormState } from "./actions";
import { GoogleIcon } from "./GoogleIcon";
import { AuthField, AuthLayout, AuthMessage, authInputClass } from "./AuthLayout";

type Mode = "signin" | "signup" | "reset";

const HEADING_KEYS: Record<Mode, { title: AuthStringKey; subtitle: AuthStringKey }> = {
  signin: { title: "auth.heading.signinTitle", subtitle: "auth.heading.signinSubtitle" },
  signup: { title: "auth.heading.signupTitle", subtitle: "auth.heading.signupSubtitle" },
  reset: { title: "auth.heading.resetTitle", subtitle: "auth.heading.resetSubtitle" },
};

const SUBMIT_KEYS: Record<Mode, AuthStringKey> = {
  reset: "auth.submit.reset",
  signup: "auth.submit.signup",
  signin: "auth.submit.signin",
};

function authText(
  locale: "en" | "pt-br",
  message: AuthFormMessage | undefined,
): string | null {
  if (!message) return null;
  return tAuth(locale, message.key, message.vars);
}

function LoginForm() {
  const locale = useStudioStore((state) => state.settings.locale);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const authError = searchParams.get("error") === "auth";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [state, formAction, pending] = useActionState(submitAuth, {} as AuthFormState);
  const [oauthPending, setOauthPending] = useState(false);
  const [oauthError, setOauthError] = useState(false);
  const supabase = createBrowserSupabase();

  // Runs in the browser on purpose: a server action would redirect cross-origin from a form
  // submission, which the CSP `form-action 'self'` directive blocks once enforced.
  async function signInWithGoogle() {
    if (!supabase) return;
    setOauthPending(true);
    setOauthError(false);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthRedirectTo(window.location.origin, next) },
    });
    if (error) {
      setOauthError(true);
      setOauthPending(false);
    }
    // On success the browser is navigating to Google; keep the button disabled.
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
  }

  const heading = HEADING_KEYS[mode];
  const errorText = authText(locale, state.error);
  const messageText = authText(locale, state.message);

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold tracking-tight">{tAuth(locale, heading.title)}</h1>
      <p className="mt-1.5 text-body text-studio-muted">{tAuth(locale, heading.subtitle)}</p>

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
              {tab === "signin" ? tAuth(locale, "auth.tab.signin") : tAuth(locale, "auth.tab.signup")}
            </button>
          ))}
        </div>
      ) : null}

      {mode !== "reset" && supabase ? (
        <div className="mt-6">
          <Button
            type="button"
            variant="secondary"
            block
            className="h-9 gap-2.5"
            disabled={oauthPending}
            onClick={signInWithGoogle}
          >
            <GoogleIcon />
            {oauthPending
              ? tAuth(locale, "auth.google.redirecting")
              : tAuth(locale, "auth.google.continue")}
          </Button>
          {oauthError ? (
            <div className="mt-3">
              <AuthMessage tone="error">{tAuth(locale, "auth.google.startError")}</AuthMessage>
            </div>
          ) : null}
          <div className="mt-6 flex items-center gap-3 text-caption text-studio-faint" aria-hidden="true">
            <span className="h-px flex-1 bg-studio-border" />
            {tAuth(locale, "auth.divider.or")}
            <span className="h-px flex-1 bg-studio-border" />
          </div>
        </div>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={safeAuthNext(next)} />
        {!supabase ? (
          <AuthMessage tone="info">{tAuth(locale, "auth.supabaseMissing")}</AuthMessage>
        ) : null}
        <AuthField id="email" label={tAuth(locale, "auth.field.email")}>
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
            label={tAuth(locale, "auth.field.password")}
            trailing={
              mode === "signin" ? (
                <button
                  type="button"
                  className="text-dense font-normal text-studio-accent-text hover:underline"
                  onClick={() => switchMode("reset")}
                >
                  {tAuth(locale, "auth.field.forgotPassword")}
                </button>
              ) : (
                <span className="text-caption font-normal text-studio-faint">
                  {tAuth(locale, passwordRequirementHint().key, passwordRequirementHint().vars)}
                </span>
              )
            }
          >
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={authInputClass}
            />
          </AuthField>
        ) : null}
        {authError ? (
          <AuthMessage tone="error">{tAuth(locale, "auth.error.confirmLink")}</AuthMessage>
        ) : null}
        {errorText ? <AuthMessage tone="error">{errorText}</AuthMessage> : null}
        {messageText ? <AuthMessage tone="success">{messageText}</AuthMessage> : null}
        <Button type="submit" variant="primary" block disabled={pending || !supabase} className="h-9">
          {pending ? tAuth(locale, "auth.submit.pending") : tAuth(locale, SUBMIT_KEYS[mode])}
        </Button>
      </form>

      <p className="mt-4 text-caption text-studio-faint">
        {tAuth(locale, "auth.consent.prefix")}{" "}
        <Link href="/termos" className="text-studio-muted hover:text-studio-fg hover:underline">
          {tAuth(locale, "auth.consent.terms")}
        </Link>{" "}
        {tAuth(locale, "auth.consent.middle")}{" "}
        <Link href="/privacidade" className="text-studio-muted hover:text-studio-fg hover:underline">
          {tAuth(locale, "auth.consent.privacy")}
        </Link>
        .
      </p>

      <div className="mt-6 flex items-center justify-between text-dense">
        {mode === "reset" ? (
          <button type="button" className="text-studio-muted hover:text-studio-fg" onClick={() => switchMode("signin")}>
            {tAuth(locale, "auth.backToSignin")}
          </button>
        ) : (
          <span />
        )}
        <Link href="/studio" className="text-studio-muted hover:text-studio-fg">
          {tAuth(locale, "auth.guest")}
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
