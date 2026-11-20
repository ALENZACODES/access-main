import type { Page } from "@playwright/test";
import { localeFromTag } from "./p20aj-copy.ts";
import { sampleSnapshot, type Connectivity, type Resource, type Snapshot, type Status, type Target } from "./p20aj-types.ts";
/** DOM inspection is read-only; connection and cache values are explicit external observations. */
export interface BrowserOptions {
  readonly route: string;
  readonly connectivity: Connectivity;
  readonly resources?: readonly Resource[];
  readonly capturedTime?: number | null;
  readonly historyIndex?: number | null;
}
export interface BrowserObservation {
  readonly snapshot: Snapshot;
  readonly documentLanguage: string | null;
  readonly horizontalOverflow: number;
  readonly headings: number;
  readonly capturedAt: number;
}
export function stableFocusId(element: { id: string | null; tag: string; name: string | null; index: number }): string {
  if (element.id?.trim()) return element.id.trim();
  if (element.name?.trim()) return `${element.tag}:${element.name.trim()}`;
  return `${element.tag}:index-${element.index}`;
}
export function visibleStatus(text: string, visible: boolean, locale: Status["locale"], id: string): Status {
  return { id, text: text.trim().replace(/\s+/g, " "), locale,
    politeness: "polite", emittedAt: null, busy: null, visible };
}
export function targetFromDimensions(input: {
  id: string; name: string | null; role: string; disabled: boolean; visible: boolean;
  inert: boolean; tabIndex: number; width: number; height: number; modalId: string | null;
}): Target {
  return { id: input.id, name: input.name, role: input.role, enabled: !input.disabled,
    visible: input.visible, inert: input.inert, tabIndex: input.tabIndex,
    width: input.width, height: input.height, focusIndicator: null, modalId: input.modalId };
}
export async function observePage(page: Page, options: BrowserOptions): Promise<BrowserObservation> {
  const result = await page.evaluate(() => {
    function visible(node: HTMLElement): boolean {
      const rect = node.getBoundingClientRect();
      const styles = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden" && styles.display !== "none";
    }
    function name(node: HTMLElement): string | null {
      const aria = node.getAttribute("aria-label");
      if (aria?.trim()) return aria.trim();
      const labelled = node.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const labelledText = labelled.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (labelledText) return labelledText;
      if (node instanceof HTMLInputElement && node.labels?.length) {
        const labels = [...node.labels].map((label) => label.textContent ?? "").join(" ").trim();
        if (labels) return labels;
      }
      const title = node.getAttribute("title");
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      return text || title?.trim() || null;
    }
    const modal = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true'],dialog[open]");
    const controls = [...document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type='hidden']),select,textarea,summary,[tabindex]",
    )].map((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        id: node.id || `${node.tagName.toLowerCase()}:index-${index}`,
        name: name(node), role: node.getAttribute("role") || node.tagName.toLowerCase(),
        disabled: node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true",
        visible: visible(node), inert: Boolean(node.closest("[inert]")), tabIndex: node.tabIndex,
        width: rect.width, height: rect.height, modalId: modal?.contains(node) ? (modal.id || "dialog") : null,
      };
    });
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeIndex = active ? [...document.querySelectorAll("*")].indexOf(active) : -1;
    const activeId = active ? (active.id || `${active.tagName.toLowerCase()}:index-${activeIndex}`) : null;
    const live = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")]
      .map((node, index) => ({ id: node.id || `status-${index}`,
        text: (node.textContent ?? "").trim().replace(/\s+/g, " "), visible: visible(node),
        politeness: node.getAttribute("aria-live") || (node.getAttribute("role") === "alert" ? "assertive" : "polite"),
        busy: node.getAttribute("aria-busy") === "true" }));
    return { language: document.documentElement.lang || null, title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      headings: document.querySelectorAll("h1").length,
      mainCount: document.querySelectorAll("main,[role='main']").length,
      activeId, modalId: modal ? (modal.id || "dialog") : null,
      controls, statuses: live, scrollY: window.scrollY,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      capturedAt: performance.now() };
  });
  const locale = localeFromTag(result.language);
  const statuses: Status[] = result.statuses.map((item) => ({
    id: item.id, text: item.text, visible: item.visible, locale,
    politeness: item.politeness === "assertive" ? "assertive" : item.politeness === "polite" ? "polite" : "UNKNOWN",
    busy: item.busy, emittedAt: null,
  }));
  const snapshot = sampleSnapshot({
    route: options.route, locale, connectivity: options.connectivity,
    title: result.title, heading: result.heading, mainCount: result.mainCount,
    activeId: result.activeId, dialogId: result.modalId,
    scrollY: result.scrollY, historyIndex: options.historyIndex ?? null,
    time: options.capturedTime ?? null,
    targets: result.controls.map(targetFromDimensions), statuses,
    resources: [...(options.resources ?? [])], evidence: [],
  });
  return { snapshot, documentLanguage: result.language,
    horizontalOverflow: result.overflow, headings: result.headings, capturedAt: result.capturedAt };
}
export function browserFindingCodes(observation: BrowserObservation, expected: "en" | "fr"): string[] {
  const codes: string[] = [];
  if (observation.snapshot.locale !== expected) codes.push("browser-locale");
  if (observation.headings !== 1) codes.push("browser-heading-count");
  if (observation.snapshot.mainCount !== 1) codes.push("browser-main-count");
  if (!observation.snapshot.title.trim()) codes.push("browser-title");
  if (observation.horizontalOverflow > 0) codes.push("browser-reflow");
  return codes;
}
