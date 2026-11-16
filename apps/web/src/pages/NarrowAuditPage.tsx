import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { mountNarrowPanel } from "../narrow/panel.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

/** Live /dev/narrow route. The panel supplies the page heading. */
export function NarrowAuditPage() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const hostRef = useRef<HTMLDivElement>(null);
  useDocumentTitle(locale === "fr" ? "Audit écran étroit" : "Narrow-screen audit");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mounted = mountNarrowPanel({ root: host, lang: locale });
    return () => {
      host.innerHTML = "";
      void mounted;
    };
  }, [locale]);

  return <div ref={hostRef} />;
}
