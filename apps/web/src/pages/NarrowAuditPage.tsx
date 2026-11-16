import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mountNarrowPanel, narrowRoute } from "../narrow/panel.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

/**
 * Live /dev/narrow route. The page heading is rendered by React, so it is in the
 * first paint and in server markup. The panel is told not to add its own, and
 * reports a language switch so the heading follows it.
 */
export function NarrowAuditPage() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const [panelLang, setPanelLang] = useState<"en" | "fr">(locale);
  const hostRef = useRef<HTMLDivElement>(null);
  const title = narrowRoute.title[panelLang];
  useDocumentTitle(title);

  useEffect(() => {
    setPanelLang(locale);
    const host = hostRef.current;
    if (!host) return;
    const mounted = mountNarrowPanel({ root: host, lang: locale, heading: false, onLang: setPanelLang });
    return () => {
      host.innerHTML = "";
      void mounted;
    };
  }, [locale]);

  return (
    <>
      <h1 lang={panelLang}>{title}</h1>
      <div ref={hostRef} />
    </>
  );
}
