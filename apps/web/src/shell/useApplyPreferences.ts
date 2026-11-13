import { useEffect } from "react";
import type { UserProfile } from "@access/shared";
import type { AppLanguage } from "../i18n/index.ts";

function contrastMode(profile: UserProfile | null): "more" | "default" {
  if (profile?.high_contrast_preference === true) return "more";
  if (profile?.high_contrast_preference === false) return "default";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-contrast: more)").matches) return "more";
  return "default";
}

export function useApplyPreferences(profile: UserProfile | null, language: AppLanguage) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dataset.textSize = profile?.text_size_preference ?? "system";
    const motion = profile?.reduced_motion_preference;
    root.dataset.motion = motion === true ? "reduce" : motion === false ? "allow" : "system";
    const applyContrast = () => {
      root.dataset.contrast = contrastMode(profile);
    };
    applyContrast();
    const query = window.matchMedia("(prefers-contrast: more)");
    query.addEventListener("change", applyContrast);
    return () => query.removeEventListener("change", applyContrast);
  }, [profile, language]);
}
