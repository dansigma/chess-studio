"use client";

import Link from "next/link";
import { t } from "@/src/i18n/strings";
import { useStudioStore } from "@/src/store/studio-store";

/** Min 32 px tall click area; the footer padding shrinks to keep its resting height. */
const FOOTER_LINK =
  "inline-flex min-h-8 items-center hover:text-studio-fg hover:underline transition-colors duration-150";

/** Legal links (SIG-1057), labelled in the site language. */
export function SiteFooter() {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <footer className="flex justify-center gap-4 border-t border-studio-border px-4 py-2 text-caption text-studio-faint">
      <Link href="/privacidade" className={FOOTER_LINK}>
        {t(locale, "nav.privacy")}
      </Link>
      <Link href="/termos" className={FOOTER_LINK}>
        {t(locale, "nav.terms")}
      </Link>
    </footer>
  );
}
