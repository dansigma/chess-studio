import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ColorSchemeSync } from "@/src/studio/ColorSchemeSync";
import { COLOR_SCHEME_BOOTSTRAP } from "@/src/studio/color-scheme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Xadrez Digital",
  description: "Chess analysis studio with board, engine, notation, and opening explorer",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
        <ColorSchemeSync />
        {children}
      </body>
    </html>
  );
}
