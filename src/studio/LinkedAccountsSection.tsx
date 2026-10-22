"use client";

// SIG-1039: "Linked accounts" settings section (My Games 1/5). Signed-in
// users link one public Lichess and one Chess.com username; guests see
// nothing. Reads/writes through the linked-accounts lib so validation and
// error codes stay in one place.
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  loadLinkedAccounts,
  removeLinkedAccount,
  saveLinkedAccount,
  type LinkedAccountSource,
  type LinkedAccountsError,
} from "@/src/lib/my-games/linked-accounts";
import { tLinkedAccounts, type LinkedAccountsStringKey } from "@/src/i18n/linked-accounts-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";

const SOURCES: ReadonlyArray<LinkedAccountSource> = ["lichess", "chesscom"];

function errorKey(error: LinkedAccountsError | "signed_out"): LinkedAccountsStringKey {
  if (error === "invalid_username") {
    return "linkedAccounts.error.invalidUsername";
  }
  if (error === "signed_out") {
    return "linkedAccounts.error.signInRequired";
  }
  return "linkedAccounts.error.unavailable";
}

function AccountRow({
  source,
  initialUsername,
  saving,
  removing,
  error,
  justSaved,
  onSave,
  onRemove,
}: {
  source: LinkedAccountSource;
  initialUsername: string;
  saving: boolean;
  removing: boolean;
  error: string | null;
  justSaved: boolean;
  onSave: (username: string) => void;
  onRemove: () => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [draft, setDraft] = useState(initialUsername);
  const [lastSynced, setLastSynced] = useState(initialUsername);
  if (initialUsername !== lastSynced) {
    setLastSynced(initialUsername);
    setDraft(initialUsername);
  }
  const busy = saving || removing;
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-body text-studio-fg">
        {tLinkedAccounts(locale, source === "lichess" ? "linkedAccounts.lichess" : "linkedAccounts.chesscom")}
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={tLinkedAccounts(locale, "linkedAccounts.usernamePlaceholder")}
          disabled={busy}
          maxLength={30}
          aria-label={tLinkedAccounts(locale, source === "lichess" ? "linkedAccounts.lichess" : "linkedAccounts.chesscom")}
          className="h-7 min-w-0 flex-1 rounded-md border border-studio-border-strong bg-studio-panel px-2 text-dense text-studio-fg"
        />
        <Button variant="secondary" size="sm" disabled={busy || draft.trim().length === 0} onClick={() => onSave(draft)}>
          {saving
            ? tLinkedAccounts(locale, "linkedAccounts.saving")
            : justSaved
              ? tLinkedAccounts(locale, "linkedAccounts.saved")
              : tLinkedAccounts(locale, "linkedAccounts.save")}
        </Button>
        {initialUsername && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
            {removing ? tLinkedAccounts(locale, "linkedAccounts.removing") : tLinkedAccounts(locale, "linkedAccounts.remove")}
          </Button>
        )}
      </div>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  );
}

export function LinkedAccountsSection() {
  const locale = useStudioStore((state) => state.settings.locale);
  const user = useStudioStore((state) => state.user);
  const [usernames, setUsernames] = useState<Record<LinkedAccountSource, string>>({
    lichess: "",
    chesscom: "",
  });
  const [loading, setLoading] = useState(Boolean(user));
  const [pending, setPending] = useState<LinkedAccountSource | null>(null);
  const [removingSource, setRemovingSource] = useState<LinkedAccountSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedSource, setSavedSource] = useState<LinkedAccountSource | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-1039: the
     loading start is intentionally synchronous so a new sign-in never
     flashes stale usernames (or the empty state) before the reload lands. */
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabase();
    if (supabase) {
      void loadLinkedAccounts(supabase).then((result) => {
        if (cancelled) {
          return;
        }
        if (result.ok) {
          const next: Record<LinkedAccountSource, string> = { lichess: "", chesscom: "" };
          for (const account of result.accounts) {
            next[account.source] = account.username;
          }
          setUsernames(next);
          setError(null);
        } else {
          setError(tLinkedAccounts(locale, errorKey(result.error)));
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user, locale]);

  if (!user) {
    return null;
  }

  const handleSave = (source: LinkedAccountSource, username: string) => {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError(tLinkedAccounts(locale, errorKey("signed_out")));
      return;
    }
    setPending(source);
    setSavedSource(null);
    setError(null);
    void saveLinkedAccount(supabase, source, username).then((result) => {
      setPending(null);
      if (result.ok) {
        const next: Record<LinkedAccountSource, string> = { lichess: "", chesscom: "" };
        for (const account of result.accounts) {
          next[account.source] = account.username;
        }
        setUsernames(next);
        setSavedSource(source);
      } else {
        setError(tLinkedAccounts(locale, errorKey(result.error)));
      }
    });
  };

  const handleRemove = (source: LinkedAccountSource) => {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError(tLinkedAccounts(locale, errorKey("signed_out")));
      return;
    }
    setRemovingSource(source);
    setSavedSource(null);
    setError(null);
    void removeLinkedAccount(supabase, source).then((result) => {
      setRemovingSource(null);
      if (result.ok) {
        const next: Record<LinkedAccountSource, string> = { lichess: "", chesscom: "" };
        for (const account of result.accounts) {
          next[account.source] = account.username;
        }
        setUsernames(next);
      } else {
        setError(tLinkedAccounts(locale, errorKey(result.error)));
      }
    });
  };

  return (
    <section className="border-t border-studio-border pt-2">
      <h3 className="pb-1 text-caption uppercase tracking-wider text-studio-faint">
        {tLinkedAccounts(locale, "linkedAccounts.title")}
      </h3>
      <p className="text-dense text-studio-muted">{tLinkedAccounts(locale, "linkedAccounts.description")}</p>
      {loading ? (
        <p className="py-2 text-dense text-studio-muted">{tLinkedAccounts(locale, "linkedAccounts.loading")}</p>
      ) : (
        <>
          {SOURCES.map((source) => (
            <AccountRow
              key={source}
              source={source}
              initialUsername={usernames[source]}
              saving={pending === source}
              removing={removingSource === source}
              error={error}
              justSaved={savedSource === source}
              onSave={(username) => handleSave(source, username)}
              onRemove={() => handleRemove(source)}
            />
          ))}
          {error && (
            <p role="alert" className="py-1 text-dense text-studio-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
