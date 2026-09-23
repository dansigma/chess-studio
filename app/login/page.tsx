"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/src/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createBrowserSupabase();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Supabase is not configured. You can still use Studio as a guest.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          throw error;
        }
        setMessage("Check your email to confirm the account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw error;
        }
        router.push("/studio");
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-studio-chrome px-4 text-studio-fg">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="w-full max-w-sm rounded-xl border border-studio-border bg-studio-elevated p-6 shadow-2xl"
      >
        <h1 className="text-xl font-medium text-studio-fg">
          Xadrez <span className="font-normal text-sky-400">Digital</span>
        </h1>
        <p className="mt-1 text-sm text-studio-muted">
          Sign in to save boards. Guest analysis works without an account.
        </p>
        {!supabase ? (
          <p className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to enable accounts.
          </p>
        ) : null}
        <label className="mt-4 block text-sm text-studio-muted">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border border-studio-border bg-studio-panel px-3 py-2 text-studio-fg outline-none"
          />
        </label>
        <label className="mt-3 block text-sm text-studio-muted">
          Password
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded border border-studio-border bg-studio-panel px-3 py-2 text-studio-fg outline-none"
          />
        </label>
        {message ? <p className="mt-3 text-sm text-sky-300">{message}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded bg-studio-accent py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          className="mt-3 w-full text-sm text-studio-muted hover:text-studio-fg"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        <Link href="/studio" className="mt-4 block text-center text-sm text-studio-faint hover:text-studio-fg">
          Continue as guest
        </Link>
      </form>
    </div>
  );
}
