import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { annotateAuditorsEnglish } from "./AuditorsTextLanguage";

/**
 * Live integration for the auditors tool. Its English-only policy paragraphs
 * are marked before paint and after the tool changes its own state. This is
 * language metadata, not an exemption from any accessibility audit.
 */
export function AuditorsLanguageRegion({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("fr") || i18n.language.startsWith("fr")
    ? "fr" : "en";

  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const update = (): void => {
      annotateAuditorsEnglish(root, language);
    };
    update();
    const observer = new MutationObserver(update);
    // No attribute observer: the adapter sets its own attributes. Text and
    // subtree mutations are sufficient for new or re-rendered paragraphs.
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language]);

  return <div ref={host}>{children}</div>;
}
