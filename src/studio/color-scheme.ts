export type ColorScheme = "dark" | "light" | "auto";
export type ResolvedColorScheme = "dark" | "light";

export const COLOR_SCHEME_IDS = ["dark", "light", "auto"] as const;

export const COLOR_SCHEMES: Record<ColorScheme, { label: string }> = {
  dark: { label: "Dark" },
  light: { label: "Light" },
  auto: { label: "System" },
};

export function isColorScheme(value: unknown): value is ColorScheme {
  return value === "dark" || value === "light" || value === "auto";
}

export function resolveColorScheme(
  scheme: ColorScheme,
  prefersDark: boolean,
): ResolvedColorScheme {
  if (scheme === "auto") {
    return prefersDark ? "dark" : "light";
  }
  return scheme;
}

export function applyColorScheme(scheme: ColorScheme): void {
  if (typeof document === "undefined") {
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveColorScheme(scheme, prefersDark);
  const root = document.documentElement;
  root.dataset.colorScheme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export const COLOR_SCHEME_BOOTSTRAP = `(function(){try{var scheme="dark";var raw=localStorage.getItem("studio-clone-settings");if(raw){var parsed=JSON.parse(raw);if(parsed&&(parsed.colorScheme==="dark"||parsed.colorScheme==="light"||parsed.colorScheme==="auto")){scheme=parsed.colorScheme;}}var resolved=scheme==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):scheme;var root=document.documentElement;root.setAttribute("data-color-scheme",resolved);root.classList.toggle("dark",resolved==="dark");root.style.colorScheme=resolved;}catch(e){}})();`;
