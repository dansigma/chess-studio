import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";
import { ColorSchemeSync } from "@/src/studio/ColorSchemeSync";
import { COLOR_SCHEME_BOOTSTRAP } from "@/src/studio/color-scheme";
import { LocaleSync } from "@/src/i18n/LocaleSync";
import { LANG_BOOTSTRAP } from "@/src/i18n/locale";
import { SITE_NAME } from "@/src/site/sections";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: SITE_NAME,
  description: "Chess analysis studio with board, engine, notation, and opening explorer",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP nonce (proxy.ts) can only be applied to server-rendered HTML, so opt every page into
  // dynamic rendering. Prerendered HTML has no nonce and its scripts would be blocked by script-src.
  await connection();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-color-scheme="dark"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full bg-studio-chrome font-sans text-studio-fg antialiased"
      >
        <Script id="color-scheme-bootstrap" strategy="beforeInteractive">
          {COLOR_SCHEME_BOOTSTRAP}
        </Script>
        <Script id="lang-bootstrap" strategy="beforeInteractive">
          {LANG_BOOTSTRAP}
        </Script>
        <ColorSchemeSync />
        <LocaleSync />
        {children}
      </body>
    </html>
  );
}
