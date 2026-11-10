"use client";

import { Panel } from "../ui/Panel";

// SIG-1273: placeholder so the center view switch has something to render.
// The Library UI (3/10 and the follow-ups) replaces this body.
export function LibraryView() {
  return <Panel as="section" data-library-view="" className="h-full w-full" />;
}
