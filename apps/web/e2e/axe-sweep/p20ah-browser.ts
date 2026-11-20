/** Live browser observations are read-only. Offline simulation belongs to test context. */
import type { Page } from "@playwright/test";
import type { Locale } from "./p20ah-handoff-policy.ts";
export interface ControlObservation {
  readonly id: string;
  readonly role: string;
  readonly name: string;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly inert: boolean;
  readonly tabIndex: number;
  readonly width: number;
  readonly height: number;
  readonly focusOutline: boolean;
}
export interface BrowserFrame {
  readonly route: string;
  readonly language: string;
  readonly title: string;
  readonly heading: string;
  readonly mainCount: number;
  readonly activeId: string | null;
  readonly scrollWidth: number;
  readonly viewportWidth: number;
  readonly controls: readonly ControlObservation[];
  readonly statuses: readonly string[];
  readonly online: boolean | null;
  readonly capturedOn: number;
}
export interface BrowserFinding {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
}
const browserProblem = (code: string, target: string, detail: string): BrowserFinding => ({ code, target, detail });
export function browserFrameFindings(frame: BrowserFrame, expected: Locale): BrowserFinding[] {
  const issues: BrowserFinding[] = [];
  if (!frame.language.toLowerCase().startsWith(expected)) issues.push(browserProblem("language-mismatch", "html", frame.language || "UNKNOWN"));
  if (!frame.title.trim()) issues.push(browserProblem("document-title", "title", "UNKNOWN"));
  if (!frame.heading.trim()) issues.push(browserProblem("main-heading", "h1", "UNKNOWN"));
  if (frame.mainCount !== 1) issues.push(browserProblem("main-count", "main", String(frame.mainCount)));
  if (frame.scrollWidth > frame.viewportWidth + 1) issues.push(browserProblem("horizontal-overflow", "html", String(frame.scrollWidth)));
  const seen = new Set<string>();
  for (const control of frame.controls) {
    if (!control.visible || control.disabled || control.inert) continue;
    if (!control.name.trim()) issues.push(browserProblem("control-unnamed", control.id, control.role));
    if (!Number.isFinite(control.width) || control.width < 44) issues.push(browserProblem("target-width", control.id, String(control.width)));
    if (!Number.isFinite(control.height) || control.height < 44) issues.push(browserProblem("target-height", control.id, String(control.height)));
    if (control.tabIndex < -1) issues.push(browserProblem("tab-index-invalid", control.id, String(control.tabIndex)));
    if (seen.has(control.id)) issues.push(browserProblem("control-id-duplicate", control.id, "Duplicate control"));
    seen.add(control.id);
  }
  return issues;
}
export function stateTransitionFindings(before: BrowserFrame, after: BrowserFrame, mode: "locale" | "offline" | "return"): BrowserFinding[] {
  const issues: BrowserFinding[] = [];
  if (mode === "locale") {
    if (before.language === after.language) issues.push(browserProblem("locale-unchanged", "html", before.language));
    if (before.route !== after.route) issues.push(browserProblem("locale-route-lost", "route", after.route));
  }
  if (mode === "offline") {
    if (after.online !== false) issues.push(browserProblem("offline-not-observed", "connection", after.online === null ? "UNKNOWN" : "online"));
    if (before.route !== after.route) issues.push(browserProblem("offline-route-lost", "route", after.route));
  }
  if (mode === "return") {
    if (before.route !== after.route) issues.push(browserProblem("return-route-mismatch", "route", after.route));
    if (before.language !== after.language) issues.push(browserProblem("return-locale-mismatch", "html", after.language));
  }
  return issues;
}
export function keyboardSequenceFindings(frames: readonly BrowserFrame[]): BrowserFinding[] {
  const issues: BrowserFinding[] = [];
  for (let i = 1; i < frames.length; i += 1) {
    const before = frames[i - 1]; const after = frames[i];
    if (!before || !after) continue;
    if (before.route !== after.route) issues.push(browserProblem("keyboard-route-changed", String(i), after.route));
    if (before.activeId === after.activeId) issues.push(browserProblem("keyboard-focus-still", String(i), before.activeId ?? "UNKNOWN"));
    if (after.activeId === null) issues.push(browserProblem("keyboard-focus-lost", String(i), "UNKNOWN"));
  }
  return issues;
}
export function browserFindingSummary(findings: readonly BrowserFinding[], maximum = 30): string {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive integer");
  const rows = [...new Set(findings.map((entry) => `${entry.code} ${entry.target}: ${entry.detail}`))];
  return rows.slice(0, maximum).join("\n") + (rows.length > maximum ? `\n${rows.length - maximum} more` : "");
}
export async function observeBrowserFrame(page: Page, route: string): Promise<BrowserFrame> {
  const observation = await page.evaluate(() => {
    const visible = (node: HTMLElement): boolean => {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
    };
    const name = (node: HTMLElement): string => {
      const explicit = node.getAttribute("aria-label")?.trim();
      if (explicit) return explicit;
      const labelled = node.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const fromIds = labelled.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (fromIds) return fromIds;
      if (node instanceof HTMLInputElement) {
        const associated = [...(node.labels ?? [])].map((label) => label.textContent ?? "").join(" ").trim();
        if (associated) return associated;
      }
      if (node instanceof HTMLImageElement) return node.alt;
      if (node.getAttribute("title")) return node.getAttribute("title")!.trim();
      return (node.textContent ?? "").trim().replace(/\s+/g, " ");
    };
    const candidates = [...document.querySelectorAll<HTMLElement>("button,a[href],input:not([type='hidden']),select,textarea,summary,[role='button']")];
    const controls = candidates.map((node, index) => {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return {
        id: node.id || `control-${index}`,
        role: node.getAttribute("role") || node.tagName.toLowerCase(),
        name: name(node), visible: visible(node),
        disabled: node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true",
        inert: Boolean(node.closest("[inert]")),
        tabIndex: node.tabIndex, width: bounds.width, height: bounds.height,
        focusOutline: style.outlineStyle !== "none" || style.boxShadow !== "none",
      };
    });
    return {
      language: document.documentElement.lang, title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      mainCount: document.querySelectorAll("main,[role='main']").length,
      activeId: document.activeElement instanceof HTMLElement ? document.activeElement.id || document.activeElement.tagName.toLowerCase() : null,
      scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth, controls,
      statuses: [...document.querySelectorAll("[role='status'],[role='alert'],[aria-live]")].map((node) => node.textContent?.trim() ?? ""),
      online: navigator.onLine, capturedOn: performance.now(),
    };
  });
  return { ...observation, route };
}
