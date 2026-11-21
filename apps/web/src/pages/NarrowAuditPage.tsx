import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BarrierDraft } from "../narrow/barrier-report.ts";
import { mountFitPanel } from "../narrow/fit-panel.ts";
import { mountHandPanel, type HandState } from "../narrow/hand-panel.ts";
import { mountNarrowPanel, narrowRoute } from "../narrow/panel.ts";
import { mountPressPanel, type PressPanelState } from "../narrow/press-panel.ts";
import { pressNote } from "../narrow/press-timing.ts";
import { mountReachPanel, type ReachPanelState } from "../narrow/reach-panel.ts";
import { mountTapPanel, type TapPanelState } from "../narrow/tap-panel.ts";
import { mountScrollPanel, type ScrollPanelState } from "../narrow/scroll-panel.ts";
import { mountSlipPanel, type SlipPanelState } from "../narrow/slip-panel.ts";
import { mountTravelPanel, type TravelPanelState } from "../narrow/travel-panel.ts";
import { mountTypingPanel, typingNoteOf, type TypingPanelState } from "../narrow/typing-panel.ts";
import { dragNeedsSite, gesturesNoteOf, mountGesturesPanel, type GesturesPanelState } from "../narrow/gestures-panel.ts";
import { mountScanPanel, scanNoteOf, scanSettingsNoteOf, type ScanPanelState } from "../narrow/scan-panel.ts";
import { mountMovingPanel, movingAimNoteOf, movingNoteOf, type MovingPanelState } from "../narrow/moving-panel.ts";
import { hoverAbilityNoteOf, hoverNeedsSite, hoverNoteOf, mountHoverPanel, type HoverPanelState } from "../narrow/hover-panel.ts";
import { mountTwicePanel, twiceNoteOf, type TwicePanelState } from "../narrow/twice-panel.ts";
import { mountStartPanel, startNoteOf, type StartPanelState } from "../narrow/start-panel.ts";
import { START_INFO, type StartPanelKey } from "../narrow/start.ts";
import { PART_HEADINGS, mountSummaryPanel, type SummaryPanelState } from "../narrow/summary-panel.ts";
import { tapNote, tapResult } from "../narrow/tap-trial.ts";
import { mountVoicePanel, type VoicePanelState } from "../narrow/voice-panel.ts";
import { zoneNote } from "../narrow/zones.ts";
import { mountZonesPanel, type ZonesState } from "../narrow/zones-panel.ts";
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
 *
 * At the end, "Reaching controls by keyboard or switch" counts the presses
 * it takes to reach each control of this page by Tab or by a switch, and how
 * long a scan takes at the interval the person gives. It counts the whole
 * page, the other panels included, and leaves itself out.
 *
 * Between the tap test and "Look by hand" sits "Screen zones I can reach":
 * the person marks the parts of the window they can reach, and the panel
 * lists the controls of this page that cannot be brought into one of them.
 * The zones go into the barrier text of the fit panel too.
 *
 * After the zones comes "How I press": the person presses a large button a
 * few times and the panel times each press and the gaps between them. That
 * line goes into the barrier text as well.
 *
 * After "How I press" comes "Say it to press it", for people who use voice
 * control: it counts the controls of this page that take extra steps by voice
 * and lets the person try a phrase.
 *
 * Then "Slips onto risky controls" finds where a tap aimed at one control may
 * land on another that does something hard to take back, with the person's
 * tap size from the tap test when they took it.
 *
 * Then "Pointer travel" counts, for each form, how far a pointer moved by the
 * head, the eyes, a mouth stick or a trackball travels from control to
 * control.
 *
 * Then "My typing pace" has the person type three short things their usual
 * way, measures their pace, and sets the text fields of this page against
 * any time limit the page states.
 *
 * Then "Dragging and gestures" has a short drag test, and finds the controls
 * of this page that ask for a drag or a gesture, with any single-tap way to
 * do the same found around them.
 *
 * Then "Switch scanning" takes how the person scans and counts the steps,
 * the time and the presses to reach each control of this page.
 *
 * Then "Things that move" takes how long the person needs to aim, watches the
 * page for that long, and says which controls moved, appeared or went away
 * and which animations never stop.
 *
 * Then "Shown on hover only" asks whether the person can hover, and reads the
 * style rules of this page for what shows on hover with no focus rule.
 *
 * Then "Asked twice" reads the forms of this page for things asked for twice.
 *
 * "Where to start", right after the audit tool, asks what the person uses to
 * point and type and puts the tests that matter most for it first.
 *
 * Then "My access summary" brings together, on request, what the person
 * measured in the tap, zones and press tests, as text to share, with a way
 * to each test not done yet.
 *
 * Last of all, "Scroll effort on this page" counts how far down the page its
 * headings, send buttons and last control sit, in screens of the window.
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
  const zonesRef = useRef<HTMLDivElement>(null);
  const zonesStateRef = useRef<ZonesState | undefined>(undefined);
  const zonesMountedRef = useRef<{ getState(): ZonesState } | null>(null);
  const pressRef = useRef<HTMLDivElement>(null);
  const pressStateRef = useRef<PressPanelState | undefined>(undefined);
  const pressMountedRef = useRef<{ getState(): PressPanelState } | null>(null);
  const voiceRef = useRef<HTMLDivElement>(null);
  const voiceStateRef = useRef<VoicePanelState | undefined>(undefined);
  const slipRef = useRef<HTMLDivElement>(null);
  const slipStateRef = useRef<SlipPanelState | undefined>(undefined);
  const travelRef = useRef<HTMLDivElement>(null);
  const travelStateRef = useRef<TravelPanelState | undefined>(undefined);
  const typingRef = useRef<HTMLDivElement>(null);
  const typingStateRef = useRef<TypingPanelState | undefined>(undefined);
  const typingMountedRef = useRef<{ getState(): TypingPanelState } | null>(null);
  const gesturesRef = useRef<HTMLDivElement>(null);
  const gesturesStateRef = useRef<GesturesPanelState | undefined>(undefined);
  const gesturesMountedRef = useRef<{ getState(): GesturesPanelState } | null>(null);
  const scanRef = useRef<HTMLDivElement>(null);
  const scanStateRef = useRef<ScanPanelState | undefined>(undefined);
  const scanMountedRef = useRef<{ getState(): ScanPanelState } | null>(null);
  const movingRef = useRef<HTMLDivElement>(null);
  const movingStateRef = useRef<MovingPanelState | undefined>(undefined);
  const movingMountedRef = useRef<{ getState(): MovingPanelState } | null>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverStateRef = useRef<HoverPanelState | undefined>(undefined);
  const hoverMountedRef = useRef<{ getState(): HoverPanelState } | null>(null);
  const twiceRef = useRef<HTMLDivElement>(null);
  const twiceStateRef = useRef<TwicePanelState | undefined>(undefined);
  const twiceMountedRef = useRef<{ getState(): TwicePanelState } | null>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const startStateRef = useRef<StartPanelState | undefined>(undefined);
  const startMountedRef = useRef<{ getState(): StartPanelState } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryStateRef = useRef<SummaryPanelState | undefined>(undefined);
  const reachRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollStateRef = useRef<ScrollPanelState | undefined>(undefined);
  const reachStateRef = useRef<ReachPanelState | undefined>(undefined);
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
    // The tap result and the zones are read when the text is prepared, so what was done after the fit panel was mounted still counts.
    const extraFacts = (): string[] => {
      const tap = tapMountedRef.current?.getState() ?? tapStateRef.current;
      const zones = zonesMountedRef.current?.getState() ?? zonesStateRef.current;
      const press = pressMountedRef.current?.getState() ?? pressStateRef.current;
      const typing = typingMountedRef.current?.getState() ?? typingStateRef.current;
      const gestures = gesturesMountedRef.current?.getState() ?? gesturesStateRef.current;
      const scan = scanMountedRef.current?.getState() ?? scanStateRef.current;
      const moving = movingMountedRef.current?.getState() ?? movingStateRef.current;
      const hover = hoverMountedRef.current?.getState() ?? hoverStateRef.current;
      const twice = twiceMountedRef.current?.getState() ?? twiceStateRef.current;
      return [
        tap ? tapNote(tap.trial, panelLang) : "",
        zones ? zoneNote(zones.cells, panelLang) : "",
        press ? pressNote(press.trial, panelLang) : "",
        typing ? typingNoteOf(typing, panelLang) : "",
        gestures ? gesturesNoteOf(gestures, panelLang) : "",
        scan ? scanNoteOf(scan, panelLang) : "",
        moving ? movingNoteOf(moving, panelLang) : "",
        hover ? hoverNoteOf(hover, panelLang) : "",
        twice ? twiceNoteOf(twice, panelLang) : "",
      ].filter((line) => line !== "");
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

  useEffect(() => {
    const host = zonesRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountZonesPanel({ root, lang: panelLang, ...(zonesStateRef.current ? { state: zonesStateRef.current } : {}) });
    zonesMountedRef.current = mounted;
    return () => {
      zonesStateRef.current = mounted.getState();
      zonesMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = pressRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountPressPanel({ root, lang: panelLang, ...(pressStateRef.current ? { state: pressStateRef.current } : {}) });
    pressMountedRef.current = mounted;
    return () => {
      pressStateRef.current = mounted.getState();
      pressMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = voiceRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountVoicePanel({ root, lang: panelLang, ...(voiceStateRef.current ? { state: voiceStateRef.current } : {}) });
    return () => {
      voiceStateRef.current = mounted.getState();
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = slipRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    // The person's tap size, read at each reading, so a tap test taken later counts.
    const tapSize = (): number | null => {
      const tap = tapMountedRef.current?.getState() ?? tapStateRef.current;
      if (!tap || tap.trial.phase !== "done") return null;
      const result = tapResult(tap.trial.taps);
      return result.kind === "size" ? result.px : null;
    };
    const mounted = mountSlipPanel({ root, lang: panelLang, tapSize, ...(slipStateRef.current ? { state: slipStateRef.current } : {}) });
    return () => {
      slipStateRef.current = mounted.getState();
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = travelRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountTravelPanel({ root, lang: panelLang, ...(travelStateRef.current ? { state: travelStateRef.current } : {}) });
    return () => {
      travelStateRef.current = mounted.getState();
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = typingRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountTypingPanel({ root, lang: panelLang, ...(typingStateRef.current ? { state: typingStateRef.current } : {}) });
    typingMountedRef.current = mounted;
    return () => {
      typingStateRef.current = mounted.getState();
      typingMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = gesturesRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountGesturesPanel({ root, lang: panelLang, ...(gesturesStateRef.current ? { state: gesturesStateRef.current } : {}) });
    gesturesMountedRef.current = mounted;
    return () => {
      gesturesStateRef.current = mounted.getState();
      gesturesMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = scanRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountScanPanel({ root, lang: panelLang, ...(scanStateRef.current ? { state: scanStateRef.current } : {}) });
    scanMountedRef.current = mounted;
    return () => {
      scanStateRef.current = mounted.getState();
      scanMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = movingRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountMovingPanel({ root, lang: panelLang, ...(movingStateRef.current ? { state: movingStateRef.current } : {}) });
    movingMountedRef.current = mounted;
    return () => {
      movingStateRef.current = mounted.getState();
      movingMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = hoverRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountHoverPanel({ root, lang: panelLang, ...(hoverStateRef.current ? { state: hoverStateRef.current } : {}) });
    hoverMountedRef.current = mounted;
    return () => {
      hoverStateRef.current = mounted.getState();
      hoverMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = twiceRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountTwicePanel({ root, lang: panelLang, ...(twiceStateRef.current ? { state: twiceStateRef.current } : {}) });
    twiceMountedRef.current = mounted;
    return () => {
      twiceStateRef.current = mounted.getState();
      twiceMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = startRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    // A go button takes focus to the heading its test starts with.
    const go = (key: StartPanelKey) => {
      const heading = document.querySelector<HTMLElement>(START_INFO[key].heading);
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus();
    };
    const mounted = mountStartPanel({ root, lang: panelLang, go, ...(startStateRef.current ? { state: startStateRef.current } : {}) });
    startMountedRef.current = mounted;
    return () => {
      startStateRef.current = mounted.getState();
      startMountedRef.current = null;
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = summaryRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    // What the panels hold at the moment the person asks, so a test done later counts in the next summary.
    // Only lines about the person come here: what a panel found on this page stays in that panel.
    const panels = () => ({
      start: startMountedRef.current?.getState() ?? startStateRef.current,
      tap: tapMountedRef.current?.getState() ?? tapStateRef.current,
      zones: zonesMountedRef.current?.getState() ?? zonesStateRef.current,
      press: pressMountedRef.current?.getState() ?? pressStateRef.current,
      typing: typingMountedRef.current?.getState() ?? typingStateRef.current,
      gestures: gesturesMountedRef.current?.getState() ?? gesturesStateRef.current,
      scan: scanMountedRef.current?.getState() ?? scanStateRef.current,
      moving: movingMountedRef.current?.getState() ?? movingStateRef.current,
      hover: hoverMountedRef.current?.getState() ?? hoverStateRef.current,
    });
    const collect = () => {
      const p = panels();
      return {
        tools: p.start ? startNoteOf(p.start, panelLang) : "",
        tap: p.tap ? tapNote(p.tap.trial, panelLang) : "",
        zones: p.zones ? zoneNote(p.zones.cells, panelLang) : "",
        press: p.press ? pressNote(p.press.trial, panelLang) : "",
        typing: p.typing ? typingNoteOf(p.typing, panelLang) : "",
        drag: p.gestures ? gesturesNoteOf(p.gestures, panelLang) : "",
        scan: p.scan ? scanSettingsNoteOf(p.scan, panelLang) : "",
        aim: p.moving ? movingAimNoteOf(p.moving, panelLang) : "",
        hover: p.hover ? hoverAbilityNoteOf(p.hover, panelLang) : "",
      };
    };
    const needs = () => {
      const p = panels();
      return { drag: p.gestures ? dragNeedsSite(p.gestures) : true, hover: p.hover ? hoverNeedsSite(p.hover) : true };
    };
    const go = (part: keyof typeof PART_HEADINGS) => {
      const heading = document.querySelector<HTMLElement>(PART_HEADINGS[part]);
      if (!heading) return;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus();
    };
    const mounted = mountSummaryPanel({ root, lang: panelLang, collect, needs, go, ...(summaryStateRef.current ? { state: summaryStateRef.current } : {}) });
    return () => {
      summaryStateRef.current = mounted.getState();
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = reachRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountReachPanel({ root, lang: panelLang, ...(reachStateRef.current ? { state: reachStateRef.current } : {}) });
    return () => {
      reachStateRef.current = mounted.getState();
      root.remove();
    };
  }, [panelLang]);

  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const root = document.createElement("div");
    host.appendChild(root);
    const mounted = mountScrollPanel({ root, lang: panelLang, ...(scrollStateRef.current ? { state: scrollStateRef.current } : {}) });
    return () => {
      scrollStateRef.current = mounted.getState();
      root.remove();
    };
  }, [panelLang]);

  return (
    <>
      <h1 lang={panelLang}>{title}</h1>
      <div ref={hostRef} />
      <div ref={startRef} />
      <div ref={fitRef} />
      <div ref={tapRef} />
      <div ref={zonesRef} />
      <div ref={pressRef} />
      <div ref={voiceRef} />
      <div ref={slipRef} />
      <div ref={travelRef} />
      <div ref={typingRef} />
      <div ref={gesturesRef} />
      <div ref={scanRef} />
      <div ref={movingRef} />
      <div ref={hoverRef} />
      <div ref={twiceRef} />
      <div ref={summaryRef} />
      <div ref={handRef} />
      <div ref={reachRef} />
      <div ref={scrollRef} />
    </>
  );
}
