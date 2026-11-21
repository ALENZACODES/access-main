import type { Page } from "@playwright/test";
import { type Connection, type Control, type Language, type Screen, type Announcement,
  type Resource, type SourceRecord, type Finding } from "./p20am-model.ts";
import { screenFindings } from "./p20am-policy.ts";

export interface BrowserCapture {
  readonly screen: Screen;
  readonly documentLanguage: string;
  readonly overflowX: number;
  readonly headingCount: number;
  readonly statusCount: number;
  readonly serviceWorkerControlled: boolean | null;
}
export interface CaptureOptions {
  readonly language: Language;
  readonly route: string;
  readonly connection?: Connection;
  readonly resources?: readonly Resource[];
  readonly records?: readonly SourceRecord[];
  readonly historyIndex?: number | null;
  readonly outcome?: Screen["outcome"];
}
interface DocumentObservation {
  documentLanguage: string;
  title: string;
  heading: string;
  headingCount: number;
  mainCount: number;
  controls: Control[];
  focusId: string | null;
  activeDialog: string | null;
  announcements: Announcement[];
  scrollY: number;
  capturedAt: number;
  overflowX: number;
  statusCount: number;
  serviceWorkerControlled: boolean | null;
}
export function captureFindings(capture: BrowserCapture, language: Language): Finding[] {
  const issues = screenFindings(capture.screen);
  if (!capture.documentLanguage.toLowerCase().startsWith(language)) {
    issues.push({ rule: "browser-language", step: 0, severity: "error", detail: capture.documentLanguage });
  }
  if (capture.headingCount !== 1) {
    issues.push({ rule: "browser-heading-count", step: 0, severity: "error", detail: String(capture.headingCount) });
  }
  if (capture.overflowX > 0) {
    issues.push({ rule: "browser-horizontal-overflow", step: 0, severity: "error", detail: String(capture.overflowX) });
  }
  return issues;
}
export function actualLanguage(value: string): Language | null {
  const first = value.toLowerCase().split("-")[0];
  return first === "en" || first === "fr" ? first : null;
}
/** Read-only DOM snapshot: never writes to IndexedDB, storage or cache. */
export async function captureBrowser(page: Page, options: CaptureOptions): Promise<BrowserCapture> {
  const observed: DocumentObservation = await page.evaluate(() => {
    const visible = (node: HTMLElement): boolean => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const name = (node: HTMLElement): string | null => {
      const aria = node.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const ids = node.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const named = ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (named) return named;
      if (node instanceof HTMLInputElement && node.labels?.length) {
        const labels = [...node.labels].map((label) => label.textContent ?? "").join(" ").trim();
        if (labels) return labels;
      }
      if (node instanceof HTMLImageElement && node.alt) return node.alt;
      const title = node.getAttribute("title")?.trim();
      if (title) return title;
      return node.textContent?.trim().replace(/\s+/g, " ") || null;
    };
    const role = (node: HTMLElement): string => node.getAttribute("role") ||
      (node instanceof HTMLButtonElement ? "button" : node instanceof HTMLAnchorElement ? "link" :
        node instanceof HTMLInputElement ? "textbox" : node.tagName.toLowerCase());
    const controls = [...document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type='hidden']),select,textarea,summary,[tabindex]",
    )].map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const id = node.id || `observed-${index}`;
      const focusVisible = style.outlineStyle !== "none" && style.outlineWidth !== "0px" ||
        style.boxShadow !== "none";
      const parentDialog = node.closest<HTMLElement>("[role='dialog'],dialog")?.id ?? null;
      return { id, name: name(node), role: role(node), visible: visible(node),
        disabled: node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true",
        inert: Boolean(node.closest("[inert]")), tabIndex: node.tabIndex, width: rect.width,
        height: rect.height, focusVisible, parentDialog };
    });
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusId = active?.id || null;
    const dialog = document.querySelector<HTMLElement>("dialog[open],[role='dialog'][aria-modal='true']");
    const liveNodes = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")];
    const language = document.documentElement.lang.toLowerCase().startsWith("fr") ? "fr" : "en";
    const announcements = liveNodes.filter(visible).map((node, index) => ({
      id: node.id || `announcement-${index}`,
      text: node.textContent?.trim().replace(/\s+/g, " ") ?? "",
      language: language as "en" | "fr",
      politeness: (node.getAttribute("aria-live") === "off" ? "off" :
        node.getAttribute("aria-live") === "assertive" || node.getAttribute("role") === "alert" ?
          "assertive" : "polite") as "polite" | "assertive" | "off",
      busy: node.getAttribute("aria-busy") === "true", eventAt: performance.now(),
    }));
    return {
      documentLanguage: document.documentElement.lang,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      headingCount: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main,[role='main']").length,
      controls, focusId, activeDialog: dialog?.id ?? (dialog ? "dialog" : null),
      announcements, scrollY: window.scrollY, capturedAt: performance.now(),
      overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      statusCount: liveNodes.length,
      serviceWorkerControlled: "serviceWorker" in navigator ?
        Boolean(navigator.serviceWorker.controller) : null,
    };
  });
  const screen: Screen = {
    route: options.route, language: actualLanguage(observed.documentLanguage) ?? options.language,
    title: observed.title, heading: observed.heading, mainCount: observed.mainCount,
    outcome: options.outcome ?? "ready", connection: options.connection ?? "UNKNOWN",
    focusId: observed.focusId, activeDialog: observed.activeDialog, controls: observed.controls,
    announcements: observed.announcements, resources: [...(options.resources ?? [])],
    records: [...(options.records ?? [])], historyIndex: options.historyIndex ?? null,
    scrollY: observed.scrollY, capturedAt: observed.capturedAt,
  };
  return { screen, documentLanguage: observed.documentLanguage,
    overflowX: observed.overflowX, headingCount: observed.headingCount,
    statusCount: observed.statusCount, serviceWorkerControlled: observed.serviceWorkerControlled };
}
export async function captureAfterKeyboard(page: Page, key: string, options: CaptureOptions): Promise<BrowserCapture> {
  const permitted = new Set(["Tab", "Shift+Tab", "Escape", "Enter", "Space", "ArrowLeft", "ArrowRight", "Home", "End"]);
  if (!permitted.has(key)) throw new RangeError(`Unsupported key: ${key}`);
  await page.keyboard.press(key);
  return captureBrowser(page, options);
}
