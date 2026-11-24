import { LogIn, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function NoticeCard({ children, action, role }: {
  children: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-studio-border-subtle p-3 text-dense ${
      action ? "bg-studio-elevated text-studio-fg" : "bg-studio-warning-bg text-studio-warning-fg"
    }`}>
      {action ? <LogIn size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        : <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
      <div>
        <p role={role}>{children}</p>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}
