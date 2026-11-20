import type { Page } from "@playwright/test";
import { sampleWorker, type Connection, type PageSnapshot, type FocusTarget, type DialogState, type LiveAnnouncement, type ServiceWorkerState } from "./p20ak-types.ts";
import { localeTag } from "./p20ak-locale.ts";

/** Read-only DOM observer. It never seeds caches, persists records or supplies place facts. */
export interface BrowserCaptureOptions {
  route: string;
  connectivity: Connection;
  historyIndex?: number | null;
}
export interface BrowserSample {
  readonly snapshot: PageSnapshot;
  readonly activeTag: string | null;
  readonly ariaLiveCount: number;
  readonly links: number;
  readonly captureFailed: boolean;
}
export function boundMeasurement(value: number | null, max = 1_000_000): number | null {
  if (value === null || !Number.isFinite(value) || value < 0 || value > max) return null;
  return value;
}
export function generatedDomId(index: number, role: string): string {
  return `${role || "target"}-${index}`;
}
export async function observeWorker(page: Page): Promise<ServiceWorkerState> {
  try {
    const observed = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { supported: false, controlling: false, script: null, scope: null, cacheNames: null, pending: false };
      const controller = navigator.serviceWorker.controller;
      const registrations = await navigator.serviceWorker.getRegistrations();
      const first = registrations[0];
      let names: string[] | null = null;
      if ("caches" in window) {
        try { names = await caches.keys(); } catch { names = null; }
      }
      return { supported: true, controlling: Boolean(controller), script: controller?.scriptURL ?? null,
        scope: first?.scope ?? null, cacheNames: names, pending: Boolean(first?.waiting) };
    });
    return { supported: observed.supported, controlling: observed.controlling,
      controllerScript: observed.script, registrationScope: observed.scope, cacheNames: observed.cacheNames,
      updatePending: observed.pending, measuredAt: 0 };
  } catch {
    return sampleWorker();
  }
}
export async function observePage(page: Page, options: BrowserCaptureOptions): Promise<BrowserSample> {
  const worker = await observeWorker(page);
  const sample = await page.evaluate(() => {
    const shown = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && !element.closest("[hidden]");
    };
    const resolvedName = (element: HTMLElement): string | null => {
      const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const referenced = labelled.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (referenced) return referenced;
      const direct = element.getAttribute("aria-label");
      if (direct?.trim()) return direct.trim();
      if (element instanceof HTMLInputElement && element.labels?.length) {
        const names = [...element.labels].map((label) => label.textContent ?? "").join(" ").trim();
        if (names) return names;
      }
      if (element instanceof HTMLImageElement && element.alt.trim()) return element.alt;
      const content = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      return content || element.getAttribute("title")?.trim() || null;
    };
    const role = (element: HTMLElement): string => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      if (element instanceof HTMLButtonElement) return "button";
      if (element instanceof HTMLAnchorElement) return "link";
      if (element instanceof HTMLInputElement) return element.type === "checkbox" ? "checkbox" : "textbox";
      if (element instanceof HTMLSelectElement) return "combobox";
      return element.tagName.toLowerCase();
    };
    const targets = [...document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type='hidden']),select,textarea,summary,[tabindex]",
    )].map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const indicator = style.outlineStyle !== "none" && style.outlineWidth !== "0px" || style.boxShadow !== "none";
      return { id: element.id || `${role(element)}-${index}`, role: role(element), name: resolvedName(element),
        order: index, tabIndex: element.tabIndex, width: rect.width, height: rect.height, visible: shown(element),
        disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
        inert: Boolean(element.closest("[inert]")), insideDialog: Boolean(element.closest("[role='dialog'],dialog")),
        focusIndicator: indicator };
    });
    const dialogNodes = [...document.querySelectorAll<HTMLElement>("dialog,[role='dialog']")];
    const dialogs = dialogNodes.map((element, index) => {
      const modal = element.getAttribute("aria-modal") === "true" || (element instanceof HTMLDialogElement && element.open);
      const open = shown(element);
      const descendants = targets.filter((target) => {
        const node = document.getElementById(target.id);
        return Boolean(node && element.contains(node));
      }).map((target) => target.id);
      const active = document.activeElement instanceof HTMLElement ? document.activeElement.id : null;
      return { id: element.id || `dialog-${index}`, open, modal, triggerId: element.getAttribute("data-trigger-id"),
        activeId: active, descendants, backgroundFocusableIds: modal && open ? targets.filter((target) => target.visible &&
          target.tabIndex >= 0 && !target.inert && !descendants.includes(target.id)).map((target) => target.id) : [] };
    });
    const announcementNodes = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")];
    const announcements = announcementNodes.map((element, index) => ({ key: element.id || `status-${index}`,
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim(), language: element.lang || document.documentElement.lang,
      politeness: element.getAttribute("aria-live") || (element.getAttribute("role") === "alert" ? "assertive" : "polite"),
      busy: element.getAttribute("aria-busy") === "true", visible: shown(element), observedAt: performance.now() }));
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return { language: document.documentElement.lang, title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "", mainCount: document.querySelectorAll("main,[role='main']").length,
      width: innerWidth, overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      activeId: active?.id || null, activeTag: active?.tagName ?? null, scrollY: window.scrollY,
      observedAt: performance.now(), targets, dialogs, announcements, links: document.querySelectorAll("a[href]").length };
  });
  const announcements: LiveAnnouncement[] = sample.announcements.map((item) => ({
    key: item.key, text: item.text, language: localeTag(item.language),
    politeness: item.politeness === "assertive" || item.politeness === "polite" || item.politeness === "off" ? item.politeness : "UNKNOWN",
    busy: item.busy, visible: item.visible, observedAt: item.observedAt,
  }));
  const dialogs: DialogState[] = sample.dialogs;
  const targets: FocusTarget[] = sample.targets;
  const snapshot: PageSnapshot = { route: options.route, connectivity: options.connectivity,
    language: localeTag(sample.language), phase: "UNKNOWN", title: sample.title, heading: sample.heading,
    mainCount: sample.mainCount, width: sample.width, horizontalOverflow: sample.overflow, activeId: sample.activeId,
    scrollY: sample.scrollY, historyIndex: options.historyIndex ?? null, observedAt: sample.observedAt,
    targets, dialogs, announcements, evidence: [], resources: [], worker };
  return { snapshot, activeTag: sample.activeTag, ariaLiveCount: sample.announcements.length,
    links: sample.links, captureFailed: false };
}
export function browserSnapshotFindings(sample: BrowserSample, expectedLocale: "en" | "fr"): string[] {
  const findings: string[] = [];
  if (sample.snapshot.language !== expectedLocale) findings.push("browser-language-mismatch");
  if (sample.snapshot.mainCount !== 1) findings.push("browser-main-count");
  if (!sample.snapshot.heading.trim()) findings.push("browser-heading-empty");
  if (!sample.snapshot.title.trim()) findings.push("browser-title-empty");
  if (sample.snapshot.horizontalOverflow > 0) findings.push("browser-horizontal-overflow");
  return findings;
}
