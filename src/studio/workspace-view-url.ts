import type { WorkspaceView } from "@/src/store/slices/types";

// SIG-1273: the center view lives in the URL as `?view=library`. Studio is the
// default, so it carries no parameter.
const PARAM = "view";

export function parseWorkspaceView(search: string): WorkspaceView {
  return new URLSearchParams(search).get(PARAM) === "library" ? "library" : "studio";
}

/** Returns `search` (with leading `?`, or "") carrying the given view. */
export function withWorkspaceView(search: string, view: WorkspaceView): string {
  const params = new URLSearchParams(search);
  if (view === "library") {
    params.set(PARAM, "library");
  } else {
    params.delete(PARAM);
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}
