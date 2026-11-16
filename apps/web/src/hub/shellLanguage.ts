import { useEffect, useLayoutEffect, type RefObject } from "react";
import { applyLanguage, type AppLanguage } from "../i18n/index.ts";

export function shellLanguage(i18n: { language: string; resolvedLanguage?: string }): AppLanguage {
  const value = i18n.resolvedLanguage ?? i18n.language;
  return value.startsWith("fr") ? "fr" : "en";
}

/** Stop an embedded tool from overwriting the shell's document language. */
export function useKeepShellHtmlLang(language: AppLanguage): void {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const restore = () => {
      if (html.lang !== language) html.lang = language;
    };
    restore();
    const observer = new MutationObserver(restore);
    observer.observe(html, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [language]);
}

function languageSelect(root: HTMLElement): HTMLSelectElement | null {
  const byId = root.querySelector("select#language");
  if (byId instanceof HTMLSelectElement) return byId;
  return (
    [...root.querySelectorAll("select")].find((element) =>
      [...element.options].some((option) => option.value === "en" || option.value === "fr"),
    ) ?? null
  );
}

/**
 * Housing, diary and auditors own an internal language that starts as
 * English and ignore the props PackageView passes. After they mount, set
 * their language control to the shell language. Language changes in the
 * tool are applied to the shell, matching SafetyPanel.
 */
export function useAdoptToolLanguage(hostRef: RefObject<HTMLElement | null>, language: AppLanguage): void {
  useKeepShellHtmlLang(language);
  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const select = languageSelect(root);
    if (!select) return;
    if (select.value !== language) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      descriptor?.set?.call(select, language);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const onChange = (event: Event) => {
      const value = (event.target as HTMLSelectElement).value;
      if (value === "en" || value === "fr") void applyLanguage(value, true);
    };
    select.addEventListener("change", onChange);
    return () => select.removeEventListener("change", onChange);
  }, [hostRef, language]);
}
