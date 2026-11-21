import type { Page } from "@playwright/test";
import { type Locale, type Connection } from "./p20an-evidence.ts";
import { type Screen, type Control, type Announcement } from "./p20an-interactions.ts";
import { type OfflineObservation } from "./p20an-offline.ts";
/** Read-only observation avoids loading packs, resetting state, or changing storage. */
export interface BrowserContext {
  readonly route: string;
  readonly locale: Locale;
  readonly connection: Connection;
  readonly phase?: Screen["phase"];
}
export interface BrowserResult {
  readonly screen: Screen;
  readonly overflow: number;
  readonly rawDocumentLanguage: string;
  readonly observedAt: number;
}
export function recognizedLanguage(value: string): Locale | null {
  if (/^en(?:-|$)/i.test(value)) return "en";
  if (/^fr(?:-|$)/i.test(value)) return "fr";
  return null;
}
export function normalizeName(value: string | null): string | null {
  if (value === null) return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}
export function browserResultFindings(result: BrowserResult, locale: Locale): string[] {
  const issues: string[] = [];
  if (recognizedLanguage(result.rawDocumentLanguage) !== locale) issues.push("document-language-mismatch");
  if (result.overflow > 1) issues.push("horizontal-reflow");
  if (result.screen.mainCount !== 1) issues.push("main-region-count");
  if (!result.screen.title.trim()) issues.push("document-title");
  if (!result.screen.heading.trim()) issues.push("heading-one");
  return issues;
}
export async function inspectBrowser(page: Page, context: BrowserContext): Promise<BrowserResult> {
  const dom = await page.evaluate(() => {
    const shown = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
    };
    const controlName = (element: HTMLElement): string | null => {
      const aria = element.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const labelled = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (labelled) return labelled;
      if (element instanceof HTMLInputElement && element.labels?.length) {
        const text = [...element.labels].map((item) => item.textContent ?? "").join(" ").trim();
        if (text) return text;
      }
      if (element instanceof HTMLImageElement && element.alt.trim()) return element.alt;
      return element.textContent?.replace(/\s+/g, " ").trim() || element.getAttribute("title") || null;
    };
    const elements = [...document.querySelectorAll<HTMLElement>(
      "button,a[href],input:not([type='hidden']),select,textarea,summary,[tabindex]",
    )];
    const controls = elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const dialog = element.closest<HTMLElement>("[role='dialog'],dialog");
      const role = element.getAttribute("role") || element.tagName.toLowerCase();
      return {
        id: element.id || `dom-control-${index}`,
        role,
        name: controlName(element),
        visible: shown(element),
        enabled: !element.hasAttribute("disabled") && element.getAttribute("aria-disabled") !== "true",
        inert: Boolean(element.closest("[inert]")),
        tabIndex: element.tabIndex,
        width: rect.width,
        height: rect.height,
        focusVisible: style.outlineStyle !== "none" || style.boxShadow !== "none",
        dialogId: dialog?.id || (dialog ? "active-dialog" : null),
      };
    });
    const nodes = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")];
    const announcements = nodes.filter(shown).map((element, index) => ({
      id: element.id || `status-${index}`,
      text: element.textContent?.trim() ?? "",
      politeness: element.getAttribute("aria-live") ?? (element.getAttribute("role") === "alert" ? "assertive" : "polite"),
      busy: element.getAttribute("aria-busy") === "true",
    }));
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const openDialog = document.querySelector<HTMLElement>("dialog[open],[role='dialog'][aria-modal='true']");
    return {
      lang: document.documentElement.lang,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      mainCount: document.querySelectorAll("main,[role='main']").length,
      focusId: active?.id || null,
      activeDialogId: openDialog?.id || (openDialog ? "active-dialog" : null),
      scrollY: window.scrollY,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      controls,
      announcements,
      observedAt: performance.now(),
    };
  });
  const controls: Control[] = dom.controls.map((c) => ({
    id: c.id, role: c.role, accessibleName: normalizeName(c.name), visible: c.visible,
    enabled: c.enabled, inert: c.inert, tabIndex: c.tabIndex, width: c.width,
    height: c.height, focusVisible: c.focusVisible, dialogId: c.dialogId,
  }));
  const language = recognizedLanguage(dom.lang) ?? context.locale;
  const announcements: Announcement[] = dom.announcements.map((item) => ({
    id: item.id, text: item.text, language,
    politeness: item.politeness === "assertive" ? "assertive" : item.politeness === "off" ? "off" : "polite",
    emittedAt: null, busy: item.busy,
  }));
  const screen: Screen = {
    route: context.route, locale: language, connection: context.connection,
    phase: context.phase ?? "UNKNOWN", title: dom.title, heading: dom.heading,
    mainCount: dom.mainCount, focusId: dom.focusId, activeDialogId: dom.activeDialogId,
    scrollY: dom.scrollY, historyIndex: null, controls, announcements,
  };
  return { screen, overflow: dom.overflow, rawDocumentLanguage: dom.lang, observedAt: dom.observedAt };
}
export async function inspectOffline(page: Page, route: string, connection: Connection): Promise<OfflineObservation> {
  const dom = await page.evaluate(async () => {
    const worker = "serviceWorker" in navigator && navigator.serviceWorker.controller ? "controlling" as const : "not-controlling" as const;
    let cacheNames: string[] | null = null;
    try { if ("caches" in window) cacheNames = await caches.keys(); } catch { cacheNames = null; }
    const retryAvailable = [...document.querySelectorAll<HTMLElement>("button,a[href]")]
      .some((item) => item.getAttribute("data-action") === "retry" || item.getAttribute("data-testid") === "retry");
    const fallbackVisible = Boolean(document.querySelector("[data-offline-fallback], [data-testid='offline-fallback']"));
    return { worker, cacheNames, retryAvailable, fallbackVisible };
  });
  return {
    route, connection, serviceWorker: dom.worker,
    cacheNames: dom.cacheNames, resources: [], fallbackVisible: dom.fallbackVisible,
    retryAvailable: dom.retryAvailable, testedAt: null,
  };
}
