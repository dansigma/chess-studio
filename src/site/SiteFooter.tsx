"use client";

import Link from "next/link";
import { t } from "@/src/i18n/strings";
import { useStudioStore } from "@/src/store/studio-store";

/** Legal links (SIG-1057), labelled in the site language. */
export function SiteFooter() {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <footer className="flex justify-center gap-4 border-t border-studio-border px-4 py-4 text-caption text-studio-faint">
      <Link href="/privacidade" className="hover:text-studio-fg hover:underline">
        {t(locale, "nav.privacy")}
      </Link>
      <Link href="/termos" className="hover:text-studio-fg hover:underline">
        {t(locale, "nav.terms")}
      </Link>
    </footer>
  );
}
