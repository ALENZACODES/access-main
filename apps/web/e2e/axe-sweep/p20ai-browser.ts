import type { Page } from "@playwright/test";
import type { AccessibilityState, Connectivity, Locale, Snapshot, StatusMessage } from "./p20ai-trace-model.ts";
import type { Focusable, KeyEvent } from "./p20ai-locale-input.ts";
/** Read only: no storage changes, no network requests, no scripted claims about a place. */
export interface BrowserObservation {
  readonly route: string;
  readonly language: string;
  readonly snapshot: Snapshot;
  readonly focusables: readonly Focusable[];
  readonly activeName: string | null;
  readonly resourceNames: readonly string[];
  readonly capturedAt: number;
}
export interface ObserveOptions {
  readonly route: string;
  readonly locale: Locale;
  readonly connection?: Connectivity;
  readonly actionAt?: number;
  readonly historyIndex?: number | null;
}
export function normalizeDomText(value: string | null): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}
export function readableRole(tag: string, explicit: string | null, type: string | null): string {
  if (explicit?.trim()) return explicit.trim();
  const lower = tag.toLowerCase();
  if (lower === "button") return "button";
  if (lower === "a") return "link";
  if (lower === "select") return "combobox";
  if (lower === "textarea") return "textbox";
  if (lower === "input") return type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : "textbox";
  return lower;
}
export function computedName(node: {
  ariaLabel: string | null;
  labelledBy: string | null;
  label: string | null;
  alt: string | null;
  text: string | null;
  title: string | null;
}): string {
  for (const candidate of [node.ariaLabel, node.labelledBy, node.label, node.alt, node.text, node.title]) {
    if (normalizeDomText(candidate)) return normalizeDomText(candidate);
  }
  return "UNKNOWN";
}
export function observerProblems(observation: BrowserObservation, expectedLocale: Locale): string[] {
  const result: string[] = [];
  if (!observation.language.toLowerCase().startsWith(expectedLocale)) result.push("document-language");
  if (observation.snapshot.a11y.mainCount !== 1) result.push("main-count");
  if (!normalizeDomText(observation.snapshot.a11y.heading)) result.push("heading-UNKNOWN");
  if (!normalizeDomText(observation.snapshot.a11y.title)) result.push("title-UNKNOWN");
  if (observation.snapshot.a11y.horizontalOverflow !== null && observation.snapshot.a11y.horizontalOverflow > 0)
    result.push("horizontal-overflow");
  for (const item of observation.focusables) {
    if (item.visible && !item.disabled && !item.inert && !normalizeDomText(item.name))
      result.push(`unnamed:${item.id}`);
  }
  return result;
}
export async function observePage(page: Page, options: ObserveOptions): Promise<BrowserObservation> {
  const dom = await page.evaluate(() => {
    const visible = (element: HTMLElement): boolean => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.height > 0 && rect.width > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const nodes = [...document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type='hidden']), select, textarea, summary, [tabindex]",
    )];
    const controls = nodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const ids = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const labelledBy = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
      const associated = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement ? [...(node.labels ?? [])].map((label) => label.textContent).join(" ") : "";
      const imageAlt = node.querySelector("img")?.getAttribute("alt") ?? null;
      const identity = node.id || `anonymous-${index}`;
      return {
        id: identity,
        name: [node.getAttribute("aria-label"), labelledBy, associated, imageAlt,
          node.textContent, node.getAttribute("title")].find((text) => text?.trim())?.trim() ?? "",
        role: node.getAttribute("role") || node.tagName.toLowerCase(),
        tabIndex: node.tabIndex, visible: visible(node),
        disabled: node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true",
        inert: Boolean(node.closest("[inert]")),
        width: rect.width, height: rect.height,
        insideDialog: Boolean(node.closest("[role='dialog'],dialog")),
      };
    });
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = current?.getBoundingClientRect();
    const dialog = document.querySelector<HTMLElement>("dialog[open],[role='dialog'][aria-modal='true']");
    const statuses = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")]
      .filter(visible).map((item, i) => ({
        id: item.id || `live-${i}`, text: item.textContent?.trim() ?? "",
        priority: item.getAttribute("aria-live") ?? (item.getAttribute("role") === "alert" ? "assertive" : "polite"),
        busy: item.getAttribute("aria-busy") === "true",
      }));
    const focusVisible = current ? visible(current) : null;
    const activeName = current ? current.getAttribute("aria-label") || current.textContent?.trim() || null : null;
    return {
      lang: document.documentElement.lang, title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      mainCount: document.querySelectorAll("main,[role='main']").length,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      focusId: current?.id || null, focusVisible,
      inDialog: Boolean(current && dialog?.contains(current)),
      inertFocus: Boolean(current?.closest("[inert]")),
      targetWidth: box?.width ?? null, targetHeight: box?.height ?? null,
      dialogId: dialog?.id || (dialog ? "active-dialog" : null),
      query: document.querySelector<HTMLInputElement>("input[type='search'],[role='searchbox']")?.value ?? "",
      scrollY: window.scrollY, statuses, controls, activeName,
      resources: [...document.querySelectorAll<HTMLLinkElement>("link[href]")].map((link) => link.getAttribute("href") ?? ""),
      now: performance.now(),
    };
  });
  const locale: Locale = dom.lang.toLowerCase().startsWith("fr") ? "fr" : "en";
  const a11y: AccessibilityState = {
    focusId: dom.focusId, focusVisible: dom.focusVisible, focusInDialog: dom.inDialog,
    focusInsideInert: dom.inertFocus, targetWidth: dom.targetWidth, targetHeight: dom.targetHeight,
    dialogId: dom.dialogId, mainCount: dom.mainCount, title: dom.title,
    heading: dom.heading, horizontalOverflow: dom.overflow,
  };
  const statuses: StatusMessage[] = dom.statuses.map((message) => ({
    id: message.id, text: message.text, locale,
    priority: message.priority === "assertive" ? "assertive" : message.priority === "off" ? "off" : "polite",
    busy: message.busy, issuedAt: options.actionAt ?? 0,
  }));
  const snapshot: Snapshot = { route: options.route, locale,
    connection: options.connection ?? "UNKNOWN", cache: "UNKNOWN", outcome: "UNKNOWN",
    at: options.actionAt ?? dom.now, historyIndex: options.historyIndex ?? null,
    scrollY: dom.scrollY, query: dom.query, a11y, evidence: [], statuses };
  return { route: options.route, language: dom.lang, snapshot, focusables: dom.controls,
    activeName: dom.activeName, resourceNames: dom.resources, capturedAt: dom.now };
}
export async function observeKey(page: Page, key: string): Promise<KeyEvent> {
  const keys = ["Tab", "Shift+Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"];
  if (!keys.includes(key)) throw new RangeError("Unsupported key");
  const before = await page.evaluate(() => ({ id: document.activeElement?.id ?? null, scroll: window.scrollY }));
  await page.keyboard.press(key);
  const after = await page.evaluate(() => ({
    id: document.activeElement?.id ?? null, scroll: window.scrollY,
    focusVisible: document.activeElement instanceof HTMLElement &&
      getComputedStyle(document.activeElement).visibility !== "hidden",
  }));
  return { key, beforeId: before.id, afterId: after.id, defaultPrevented: null,
    focusVisible: after.focusVisible, scrollBefore: before.scroll, scrollAfter: after.scroll };
}
