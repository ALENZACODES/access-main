import type { Page } from "@playwright/test";
import type { AuditLocale } from "./p20ad-offline-copy.ts";
import type {
  CacheState, ConnectionState, ControlObservation, EvidenceObservation,
  OutcomeState, RouteObservation, StatusObservation,
} from "./p20ad-offline-contracts.ts";

/** A browser-side recording contains only observed DOM facts, not estimates. */
export interface BrowserCaptureOptions {
  path: string;
  expectedLocale: AuditLocale;
  connection?: ConnectionState;
  cache?: CacheState;
  outcome?: OutcomeState;
  evidence?: readonly EvidenceObservation[];
  historyIndex?: number | null;
}

export interface BrowserCapture {
  route: RouteObservation;
  documentLanguage: string | null;
  visibleControls: number;
  unnamedControls: number;
  statusCount: number;
  capturedAfterLoad: boolean;
}

export interface KeyboardSequenceItem {
  key: "Tab" | "Shift+Tab" | "Enter" | "Escape" | "Space" | "ArrowRight" |
    "ArrowLeft" | "ArrowUp" | "ArrowDown" | "Home" | "End";
  before: string | null;
  after: string | null;
  beforeScrollY: number;
  afterScrollY: number;
  beforeUrl: string;
  afterUrl: string;
  pressedAt: number;
}

export interface NavigationCapture {
  from: string;
  to: string;
  responseStatus: number | null;
  title: string;
  heading: string | null;
  locale: string | null;
  mainCount: number;
}

/**
 * Avoid matching English-only aria-label text. ARIA naming is resolved from
 * labelledby, native labels, alternate text and visible text before it is
 * considered missing. This is a read-only observation for both languages.
 */
export async function observeOfflineRoute(page: Page, options: BrowserCaptureOptions): Promise<BrowserCapture> {
  const dom = await page.evaluate(() => {
    const visible = (element: HTMLElement): boolean => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        style.opacity !== "0" && rect.width > 0 && rect.height > 0;
    };
    const nameOf = (element: HTMLElement): string | null => {
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      if (ariaLabel) return ariaLabel;
      const tokens = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const labelled = tokens.map((token) => document.getElementById(token)?.textContent?.trim() ?? "").join(" ").trim();
      if (labelled) return labelled;
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) {
        const labels = [...(element.labels ?? [])].map((label) => label.textContent?.trim() ?? "").join(" ").trim();
        if (labels) return labels;
      }
      if (element instanceof HTMLImageElement && element.alt.trim()) return element.alt.trim();
      const ownText = element.textContent?.trim().replace(/\s+/g, " ") ?? "";
      if (ownText) return ownText.slice(0, 200);
      const title = element.getAttribute("title")?.trim();
      return title || null;
    };
    const roleOf = (element: HTMLElement): string => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      if (element instanceof HTMLButtonElement) return "button";
      if (element instanceof HTMLAnchorElement) return "link";
      if (element instanceof HTMLInputElement) return element.type === "checkbox" ? "checkbox" : "textbox";
      if (element instanceof HTMLSelectElement) return "combobox";
      return element.tagName.toLowerCase();
    };
    const selector = "a[href],button,input:not([type='hidden']),select,textarea,summary,[tabindex]";
    const elements = [...document.querySelectorAll<HTMLElement>(selector)];
    const modal = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true'],dialog[open]");
    const controls = elements.map((element, index) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const tabIndex = element.tabIndex;
      const outline = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
      return {
        id: element.id || element.getAttribute("data-testid") || `control-${index}`,
        role: roleOf(element),
        name: nameOf(element),
        visible: visible(element),
        disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
        inert: Boolean(element.closest("[inert]")),
        tabIndex,
        width: rect.width,
        height: rect.height,
        // If focus styling is only supplied through :focus-visible, it cannot
        // be determined from the unfocused snapshot: leave it UNKNOWN.
        focusVisible: document.activeElement === element ? outline || style.boxShadow !== "none" : null,
        insideDialog: modal ? modal.contains(element) : false,
      };
    });
    const statusElements = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")];
    const statuses = statusElements.map((element, index) => {
      const role = element.getAttribute("role");
      const explicit = element.getAttribute("aria-live");
      const politeness: "off" | "polite" | "assertive" | "unknown" = explicit === "polite" || explicit === "assertive" || explicit === "off"
        ? explicit : role === "status" ? "polite" : role === "alert" ? "assertive" : "unknown";
      return {
        id: element.id || `status-${index}`,
        text: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
        locale: element.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang,
        politeness,
        visible: visible(element),
        busy: element.getAttribute("aria-busy") === "true",
      };
    });
    const active = document.activeElement as HTMLElement | null;
    const heading = document.querySelector("h1")?.textContent?.trim() ?? null;
    const mainCount = document.querySelectorAll("main,[role='main']").length;
    const locale = document.documentElement.getAttribute("lang");
    const focusId = active && active !== document.body ?
      (active.id || active.getAttribute("data-testid") || active.tagName.toLowerCase()) : null;
    return {
      controls, statuses, locale, title: document.title, heading,
      mainCount, modalOpen: Boolean(modal), focusId, scrollY: window.scrollY,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      capturedAt: performance.now(), readyState: document.readyState,
    };
  });
  const language = dom.locale?.toLowerCase() ?? "";
  const locale: AuditLocale | null = language === "fr" || language.startsWith("fr-") ? "fr" :
    language === "en" || language.startsWith("en-") ? "en" : null;
  const controls: ControlObservation[] = dom.controls.map((control) => ({
    ...control,
    focusVisible: control.focusVisible,
  }));
  const statuses: StatusObservation[] = dom.statuses.map((status) => ({
    id: status.id,
    text: status.text,
    locale: status.locale?.toLowerCase().startsWith("fr") ? "fr" :
      status.locale?.toLowerCase().startsWith("en") ? "en" : null,
    politeness: status.politeness,
    visible: status.visible,
    busy: status.busy,
    emittedAt: null, // DOM does not reveal when assistive technology announced a change.
  }));
  const route: RouteObservation = {
    path: options.path,
    locale,
    connection: options.connection ?? "unknown",
    cache: options.cache ?? "unknown",
    outcome: options.outcome ?? "ready",
    title: dom.title,
    heading: dom.heading,
    mainCount: dom.mainCount,
    dialogOpen: dom.modalOpen,
    focusId: dom.focusId,
    controls,
    statuses,
    evidence: [...(options.evidence ?? [])],
    scrollY: dom.scrollY,
    historyIndex: options.historyIndex ?? null,
    viewport: dom.viewport,
    horizontalOverflow: dom.horizontalOverflow,
    capturedAt: dom.capturedAt,
  };
  return {
    route,
    documentLanguage: dom.locale,
    visibleControls: controls.filter((control) => control.visible && !control.disabled).length,
    unnamedControls: controls.filter((control) => control.visible && !control.disabled && !control.name).length,
    statusCount: statuses.filter((status) => status.visible).length,
    capturedAfterLoad: dom.readyState === "complete" || dom.readyState === "interactive",
  };
}

export async function observeKeyboardSequence(page: Page, keys: readonly KeyboardSequenceItem["key"][]): Promise<KeyboardSequenceItem[]> {
  const result: KeyboardSequenceItem[] = [];
  for (const key of keys) {
    const before = await page.evaluate(() => ({
      id: (document.activeElement as HTMLElement | null)?.id || null,
      scrollY: window.scrollY,
      url: location.pathname,
      at: performance.now(),
    }));
    await page.keyboard.press(key);
    const after = await page.evaluate(() => ({
      id: (document.activeElement as HTMLElement | null)?.id || null,
      scrollY: window.scrollY,
      url: location.pathname,
    }));
    result.push({
      key,
      before: before.id,
      after: after.id,
      beforeScrollY: before.scrollY,
      afterScrollY: after.scrollY,
      beforeUrl: before.url,
      afterUrl: after.url,
      pressedAt: before.at,
    });
  }
  return result;
}

export async function captureNavigation(page: Page, path: string): Promise<NavigationCapture> {
  const from = new URL(page.url()).pathname;
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  const data = await page.evaluate(() => ({
    heading: document.querySelector("h1")?.textContent?.trim() ?? null,
    locale: document.documentElement.getAttribute("lang"),
    mainCount: document.querySelectorAll("main,[role='main']").length,
    title: document.title,
  }));
  return {
    from,
    to: new URL(page.url()).pathname,
    responseStatus: response?.status() ?? null,
    ...data,
  };
}

/** Keyboard audit only asserts that observed focus is a visible, eligible target. */
export function keyboardSequenceFindings(
  items: readonly KeyboardSequenceItem[],
  controls: readonly ControlObservation[],
): string[] {
  const findings: string[] = [];
  const targets = new Map(controls.map((control) => [control.id, control]));
  for (const [index, item] of items.entries()) {
    if (item.key === "Tab" || item.key === "Shift+Tab") {
      if (item.after === null) findings.push(`keyboard-focus-unknown:${index}`);
      else {
        const target = targets.get(item.after);
        if (target && (!target.visible || target.inert || target.disabled)) {
          findings.push(`keyboard-focus-unavailable:${index}`);
        }
      }
    }
    if (item.key === "Escape" && item.beforeUrl !== item.afterUrl) {
      findings.push(`escape-navigated:${index}`);
    }
    if (!Number.isFinite(item.pressedAt) || item.pressedAt < 0) {
      findings.push(`keyboard-timestamp-invalid:${index}`);
    }
  }
  return findings;
}

export function navigationFindings(capture: NavigationCapture, expected: string, locale: AuditLocale): string[] {
  const findings: string[] = [];
  if (capture.to !== expected) findings.push("navigation-wrong-route");
  if (capture.responseStatus === null) findings.push("navigation-response-unknown");
  else if (capture.responseStatus >= 400) findings.push("navigation-response-error");
  if (capture.mainCount !== 1) findings.push("navigation-main-count");
  if (!capture.title.trim()) findings.push("navigation-title-missing");
  if (!capture.heading) findings.push("navigation-heading-missing");
  if (capture.locale === null || !capture.locale.toLowerCase().startsWith(locale)) {
    findings.push("navigation-language-mismatch");
  }
  return findings;
}
