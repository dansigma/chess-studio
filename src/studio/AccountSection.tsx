"use client";

import { useState } from "react";
import { DISPLAY_NAME_MAX_LENGTH } from "@/src/lib/auth/user-info";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import type { SiteLocale } from "@/src/i18n/locale";
import { tStudioChrome } from "@/src/i18n/studio-chrome-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "./ui/Button";

// SIG-1216: optional account display name, stored in Supabase Auth
// `user_metadata.display_name`. user_metadata is user-editable, so this value
// is display-only and must never be used for authorization. (`public.profiles`
// is read-only for clients, so the name does not live there.)
export function AccountSection() {
  const user = useStudioStore((state) => state.user);
  const locale = useStudioStore((state) => state.settings.locale);
  if (!user) {
    return null;
  }
  // Keyed on the saved name so the draft resets after a save or a user switch.
  return <AccountNameForm key={`${user.id}:${user.displayName ?? ""}`} locale={locale} />;
}

function AccountNameForm({ locale }: { locale: SiteLocale }) {
  const user = useStudioStore((state) => state.user);
  const setUser = useStudioStore((state) => state.setUser);
  const setStatus = useStudioStore((state) => state.setStatus);
  const saved = user?.displayName ?? "";
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const trimmed = draft.trim();
  const tooLong = trimmed.length > DISPLAY_NAME_MAX_LENGTH;
  const unchanged = trimmed === saved;

  const save = async () => {
    if (!user || saving || unchanged || tooLong) {
      return;
    }
    const supabase = createBrowserSupabase();
    setSaving(true);
    setError(false);
    try {
      const displayName = trimmed === "" ? null : trimmed;
      const result = await supabase?.auth.updateUser({ data: { display_name: displayName } });
      if (!supabase || !result || result.error) {
        throw result?.error ?? new Error("Supabase unavailable");
      }
      // Update the store right away; the auth-state listener will also fire.
      setUser({ ...user, displayName });
      setStatus(tStudioChrome(locale, "chrome.settings.accountNameSaved"));
    } catch {
      setError(true);
      setStatus(tStudioChrome(locale, "chrome.settings.accountNameError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border-t border-studio-border pt-2 first:border-t-0 first:pt-0">
      <h3 className="pb-1 text-caption uppercase tracking-wider text-studio-faint">
        {tStudioChrome(locale, "chrome.settings.account")}
      </h3>
      <form
        className="flex items-center justify-between gap-4 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor="account-display-name" className="text-body text-studio-fg">
          {tStudioChrome(locale, "chrome.settings.accountName")}
        </label>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <input
            id="account-display-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={saving}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoComplete="name"
            className="h-7 min-w-0 flex-1 rounded-md border border-studio-border-strong bg-studio-panel px-2 text-dense text-studio-fg"
          />
          <Button type="submit" variant="secondary" size="sm" disabled={saving || unchanged || tooLong}>
            {saving
              ? tStudioChrome(locale, "chrome.settings.accountNameSaving")
              : tStudioChrome(locale, "chrome.settings.accountNameSave")}
          </Button>
        </div>
      </form>
      <p className="text-caption text-studio-faint">{tStudioChrome(locale, "chrome.settings.accountNameHint")}</p>
      {error ? (
        <p role="alert" className="pt-1 text-dense text-studio-danger">
          {tStudioChrome(locale, "chrome.settings.accountNameError")}
        </p>
      ) : null}
    </section>
  );
}
