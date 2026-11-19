import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BarrierDraft } from "../narrow/barrier-report.ts";
import { mountFitPanel } from "../narrow/fit-panel.ts";
import { mountNarrowPanel, narrowRoute } from "../narrow/panel.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

/**
 * Live /dev/narrow route. The page heading is rendered by React, so it is in the
 * first paint and in server markup. The panel is told not to add its own, and
 * reports a language switch so the heading follows it.
 *
 * Under the audit panel sits "This page on your screen": what the browser
 * reports about the screen, what the checks find in plain words, and a form
 * that turns a barrier into text to copy or save. It follows the language of
 * the audit panel, and keeps what the person wrote when the language changes.
 */
export function NarrowAuditPage() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const [panelLang, setPanelLang] = useState<"en" | "fr">(locale);
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<BarrierDraft | undefined>(undefined);
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

  useEffect(() => {
    const host = fitRef.current;
    if (!host) return;
    // A fresh element for each mount, so the click listener of the previous language goes with it.
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountFitPanel({ root, lang: panelLang, ...(draftRef.current ? { draft: draftRef.current } : {}) });
    return () => {
      draftRef.current = mounted.getDraft();
      root.remove();
    };
  }, [panelLang]);

  return (
    <>
      <h1 lang={panelLang}>{title}</h1>
      <div ref={hostRef} />
      <div ref={fitRef} />
    </>
  );
}
