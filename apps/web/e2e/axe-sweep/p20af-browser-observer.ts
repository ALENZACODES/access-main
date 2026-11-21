/** Browser observation is read-only. No value is promoted from absence to a claim. */
import type { Page } from "@playwright/test";
import type { Connection, Locale, State, Focus, StatusMessage } from "./p20af-transition-ledger.ts";
import type { Control, Stroke, Key } from "./p20af-localized-controls.ts";
export interface BrowserFrame {
  observedRoute: string;
  declaredLanguage: string;
  state: State;
  controls: Control[];
  overflow: number;
  h1Count: number;
  observedAt: number;
}
export interface CaptureOptions { route: string; locale: Locale; connection?: Connection; }
export interface BrowserProblem { code: string; detail: string; }
export async function observeFrame(page: Page, options: CaptureOptions): Promise<BrowserFrame> {
  const dom = await page.evaluate(() => {
    const visible = (element: Element): boolean => {
      if (!(element instanceof HTMLElement)) return false;
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
    };
    const name = (element: HTMLElement): string => {
      const label = element.getAttribute("aria-label")?.trim();
      if (label) return label;
      const ids = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const fromReferences = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (fromReferences) return fromReferences;
      if (element instanceof HTMLInputElement && element.labels?.length) {
        const text = [...element.labels].map((label) => label.textContent ?? "").join(" ").trim();
        if (text) return text;
      }
      if (element instanceof HTMLImageElement) return element.alt;
      return (element.textContent ?? "").trim().replace(/\s+/g, " ");
    };
    const role = (element: HTMLElement): Control["kind"] => {
      const role = element.getAttribute("role");
      if (role === "tab" || role === "radio" || role === "checkbox" || role === "dialog") return role;
      if (element instanceof HTMLButtonElement) return "button";
      if (element instanceof HTMLAnchorElement && element.hasAttribute("href")) return "link";
      if (element instanceof HTMLInputElement) return element.type === "checkbox" ? "checkbox" : element.type === "radio" ? "radio" : "textbox";
      if (element.tagName.toLowerCase() === "summary") return "summary";
      return "other";
    };
    const flag = (element: Element, attr: string): boolean | null => {
      const value = element.getAttribute(attr);
      return value === "true" ? true : value === "false" ? false : null;
    };
    const elements = [...document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type='hidden']),textarea,select,summary,[tabindex]",
    )];
    const controls = elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.id || `index-${index}`,
        kind: role(element),
        name: name(element),
        visible: visible(element),
        disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
        inert: element.closest("[inert]") !== null,
        width: rect.width,
        height: rect.height,
        tabindex: element.tabIndex,
        active: document.activeElement === element,
        expanded: flag(element, "aria-expanded"),
        selected: flag(element, "aria-selected"),
        controls: (element.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean),
        language: element.getAttribute("lang") ?? document.documentElement.lang,
      };
    });
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeBounds = active?.getBoundingClientRect();
    const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true'],dialog[open]");
    const announcements = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")]
      .filter(visible).map((element, index) => ({
        id: element.id || `status-${index}`,
        text: element.textContent?.trim() ?? "",
        live: element.getAttribute("aria-live") || (element.getAttribute("role") === "alert" ? "assertive" : "polite"),
        busy: flag(element, "aria-busy"),
      }));
    return {
      route: window.location.pathname,
      language: document.documentElement.lang,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      h1Count: document.querySelectorAll("h1").length,
      mains: document.querySelectorAll("main,[role='main']").length,
      focus: {
        id: active?.id || null,
        visible: active ? visible(active) : null,
        inert: active ? active.closest("[inert]") !== null : null,
        withinDialog: active && dialog ? dialog.contains(active) : null,
        width: activeBounds?.width ?? null,
        height: activeBounds?.height ?? null,
      },
      controls,
      announcements,
      dialog: dialog?.id ?? null,
      scrollY: window.scrollY,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      observedAt: performance.now(),
    };
  });
  const language: Locale = dom.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  const focus: Focus = dom.focus;
  const messages: StatusMessage[] = dom.announcements.map((entry) => ({
    id: entry.id, text: entry.text, locale: language,
    live: entry.live === "assertive" ? "assertive" : entry.live === "off" ? "off" : "polite",
    busy: entry.busy,
  }));
  const state: State = {
    route: dom.route, locale: language, connection: options.connection ?? "unknown", cache: "unknown",
    result: "unknown", heading: dom.heading, title: dom.title, mains: dom.mains,
    focus, facts: [], messages, dialog: dom.dialog, history: null, scrollY: dom.scrollY,
    clock: dom.observedAt,
  };
  return { observedRoute: dom.route, declaredLanguage: dom.language, state,
    controls: dom.controls.map((control) => ({ ...control, language: control.language.toLowerCase().startsWith("fr") ? "fr" : control.language.toLowerCase().startsWith("en") ? "en" : "unknown" })),
    overflow: dom.overflow, h1Count: dom.h1Count, observedAt: dom.observedAt };
}
export function browserFindings(frame: BrowserFrame, expected: CaptureOptions): BrowserProblem[] {
  const issues: BrowserProblem[] = [];
  if (frame.observedRoute !== expected.route) issues.push({ code: "browser-route", detail: frame.observedRoute });
  if (frame.state.locale !== expected.locale) issues.push({ code: "browser-locale", detail: frame.declaredLanguage });
  if (frame.h1Count !== 1) issues.push({ code: "browser-heading-count", detail: String(frame.h1Count) });
  if (frame.state.mains !== 1) issues.push({ code: "browser-main-count", detail: String(frame.state.mains) });
  if (frame.overflow > 0) issues.push({ code: "browser-overflow", detail: String(frame.overflow) });
  if (!frame.state.title.trim()) issues.push({ code: "browser-title-empty", detail: frame.observedRoute });
  return issues;
}
export async function observeStroke(page: Page, key: Key): Promise<Stroke> {
  const before = await page.evaluate(() => ({ focus: document.activeElement?.id || null, scroll: window.scrollY }));
  await page.keyboard.press(key);
  const after = await page.evaluate(() => ({ focus: document.activeElement?.id || null, scroll: window.scrollY }));
  return { key, beforeId: before.focus, afterId: after.focus, scrolled: before.scroll !== after.scroll };
}
export async function observeConnection(page: Page): Promise<Connection> {
  const state = await page.evaluate(() => navigator.onLine);
  return state ? "online" : "offline";
}
