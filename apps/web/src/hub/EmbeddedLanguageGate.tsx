import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { applyLanguage } from "../i18n/index.ts";

type Language = "en" | "fr";

type Choice = HTMLSelectElement;

/** Only the embedded tool's own EN/FR chooser may change its internal locale. */
export function findEmbeddedLanguageControl(root: HTMLElement): Choice | null {
  return [...root.querySelectorAll<HTMLSelectElement>("select")].find((select) => {
    const values = [...select.options].map((option) => option.value);
    return values.includes("en") && values.includes("fr");
  }) ?? null;
}

/**
 * Dispatch a genuine input/change sequence through the controlled selector.
 * Setting a React prop alone cannot initialize the three linked tools: their
 * current implementations initialize local state to English.
 */
export function requestEmbeddedLanguage(select: Choice, language: Language): void {
  if (select.value === language) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (!setter) throw new Error("The language selector does not support value updates");
  setter.call(select, language);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * A render guard for tools that own an English-first state, regardless of
 * initialLanguage props. The child mounts in an invisible, inert region so
 * its control can be changed in a layout effect before first paint. The tool
 * is exposed only once its heading actually changes to the requested locale.
 * Merely changing a select's DOM value is not considered success.
 */
export function EmbeddedLanguageGate({ language, children }: {
  language: Language;
  children: ReactNode;
}) {
  const { t } = useTranslation("hub");
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let active = true;
    const select = findEmbeddedLanguageControl(root);
    const heading = root.querySelector("h1");
    if (!select || !heading) return;
    const initialHeading = heading.textContent?.trim() ?? "";
    const firstLanguage = select.value;
    const check = (): void => {
      if (!active) return;
      const current = findEmbeddedLanguageControl(root);
      const actualHeading = root.querySelector("h1")?.textContent?.trim() ?? "";
      // No empty title is accepted; for a changed locale require a changed
      // heading, not just a programmatically changed select value.
      if (current?.value === language && actualHeading &&
        (firstLanguage === language || actualHeading !== initialHeading)) {
        setReady(true);
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    if (select.value !== language) requestEmbeddedLanguage(select, language);
    check();
    // When a person uses a tool's own picker, update the shell too. Do not
    // allow the tool to display one locale under another document language.
    const onChange = (event: Event): void => {
      if (event.target !== select) return;
      const next = select.value;
      if ((next === "en" || next === "fr") && next !== language) {
        void applyLanguage(next, true);
      }
    };
    select.addEventListener("change", onChange);
    return () => {
      active = false;
      observer.disconnect();
      select.removeEventListener("change", onChange);
    };
  }, [language]);

  return (
    <>
      {!ready ? <p role="status">{t("loading")}</p> : null}
      <div
        ref={rootRef}
        aria-hidden={!ready}
        style={ready ? undefined : { visibility: "hidden", height: 0, overflow: "hidden" }}
      >
        {children}
      </div>
    </>
  );
}
