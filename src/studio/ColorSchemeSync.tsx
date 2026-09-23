"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useStudioStore } from "@/src/store/studio-store";
import { applyColorScheme } from "./color-scheme";

export function ColorSchemeSync() {
  const colorScheme = useStudioStore((state) => state.settings.colorScheme);
  const settingsReady = useRef(false);

  useLayoutEffect(() => {
    if (!settingsReady.current) {
      settingsReady.current = true;
      useStudioStore.getState().hydrateLocalSettings();
    }
    applyColorScheme(useStudioStore.getState().settings.colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    if (colorScheme !== "auto") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyColorScheme("auto");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [colorScheme]);

  return null;
}
