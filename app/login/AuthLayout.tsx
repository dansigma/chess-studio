import type { ReactNode } from "react";
import { BrandLockup } from "@/src/studio/ui/BrandLockup";

const FEATURES = [
  "Stockfish analysis right in the browser",
  "Opening explorer with master and online games",
  "Repertoires, notes and boards synced to your account",
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-studio-bg text-studio-fg">
      <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden border-r border-studio-border bg-studio-chrome p-10 lg:flex">
        <BrandLockup size="lg" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 grid grid-cols-8 opacity-[0.06] [mask-image:radial-gradient(circle_at_top_right,black,transparent_70%)]"
        >
          {Array.from({ length: 64 }, (_, index) => (
            <span
              key={index}
              className={`h-14 w-14 ${(Math.floor(index / 8) + index) % 2 === 0 ? "bg-studio-fg" : ""}`}
            />
          ))}
        </div>
        <div className="relative">
          <h2 className="text-2xl font-semibold tracking-tight">Your chess study, in one place.</h2>
          <ul className="mt-5 space-y-2.5 text-body text-studio-muted">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-studio-accent" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-caption text-studio-faint">Guest analysis works without an account.</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLockup size="lg" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthField({
  id,
  label,
  trailing,
  children,
}: {
  id: string;
  label: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-dense font-medium text-studio-muted">
          {label}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  );
}

export const authInputClass =
  "h-9 w-full rounded-lg border border-studio-border-strong bg-studio-panel px-3 text-body text-studio-fg outline-none placeholder:text-studio-faint focus:border-studio-accent";

export function AuthMessage({ tone, children }: { tone: "info" | "error" | "success"; children: ReactNode }) {
  const toneClass =
    tone === "error"
      ? "border-studio-danger/30 bg-studio-danger/10 text-studio-danger"
      : tone === "success"
        ? "border-studio-success/30 bg-studio-success/10 text-studio-success"
        : "border-studio-border-strong bg-studio-warning-bg text-studio-warning-fg";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-dense ${toneClass}`}>
      {children}
    </p>
  );
}
