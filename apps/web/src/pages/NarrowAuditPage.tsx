import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BarrierDraft } from "../narrow/barrier-report.ts";
import { mountFitPanel } from "../narrow/fit-panel.ts";
import { mountHandPanel, type HandState } from "../narrow/hand-panel.ts";
import { mountNarrowPanel, narrowRoute } from "../narrow/panel.ts";
import { mountTapPanel, type TapPanelState } from "../narrow/tap-panel.ts";
import { tapNote } from "../narrow/tap-trial.ts";
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
 *
 * Last comes "Look by hand": the by-hand steps one at a time, with a log of
 * what the person found to copy or save. It follows the same language and
 * keeps the session when the language changes.
 *
 * Between the two sits "Button size for my taps": a short test that finds
 * the size at which the person's taps land on this screen, and says which
 * zoom brings the controls of the App to it. Its result goes into the
 * barrier text of the fit panel, with the screen settings, once there is one.
 */
export function NarrowAuditPage() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const [panelLang, setPanelLang] = useState<"en" | "fr">(locale);
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<BarrierDraft | undefined>(undefined);
  const handRef = useRef<HTMLDivElement>(null);
  const handStateRef = useRef<HandState | undefined>(undefined);
  const tapRef = useRef<HTMLDivElement>(null);
  const tapStateRef = useRef<TapPanelState | undefined>(undefined);
  const tapMountedRef = useRef<{ getState(): TapPanelState } | null>(null);
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
    // The tap result is read when the text is prepared, so a test taken after the fit panel was mounted still counts.
    const extraFacts = (): string[] => {
      const tap = tapMountedRef.current?.getState() ?? tapStateRef.current;
      const line = tap ? tapNote(tap.trial, panelLang) : "";
      return line === "" ? [] : [line];
    };
    const mounted = mountFitPanel({ root, lang: panelLang, extraFacts, ...(draftRef.current ? { draft: draftRef.current } : {}) });
    return () => {
      draftRef.current = mounted.getDraft();
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = handRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountHandPanel({ root, lang: panelLang, ...(handStateRef.current ? { state: handStateRef.current } : {}) });
    return () => {
      handStateRef.current = mounted.getState();
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = tapRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountTapPanel({ root, lang: panelLang, ...(tapStateRef.current ? { state: tapStateRef.current } : {}) });
    tapMountedRef.current = mounted;
    return () => {
      tapStateRef.current = mounted.getState();
      tapMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  return (
    <>
      <h1 lang={panelLang}>{title}</h1>
      <div ref={hostRef} />
      <div ref={fitRef} />
      <div ref={tapRef} />
      <div ref={handRef} />
    </>
  );
}
