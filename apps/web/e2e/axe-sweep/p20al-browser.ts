import type { Page } from "@playwright/test";
import { type CacheRecord, type FocusRecord, type Network, type Outcome,
  type Screen, type SourceRecord, type Locale, type Finding, finding, screenFindings } from "./p20al-contract.ts";
import { type Target, targetProblems } from "./p20al-keyboard.ts";

/** Passive DOM observations. The browser is never asked to mutate user data. */
export interface BrowserSnapshot {
  readonly screen: Screen;
  readonly targets: readonly Target[];
  readonly documentLanguage: string;
  readonly viewportWidth: number;
  readonly horizontalOverflow: number;
  readonly observedAt: number;
  readonly missingControls: number;
}
export interface BrowserOptions {
  readonly route: string;
  readonly locale: Locale;
  readonly network?: Network;
  readonly outcome?: Outcome;
  readonly cache?: Screen["cache"];
  readonly records?: readonly SourceRecord[];
  readonly resources?: readonly CacheRecord[];
  readonly historyIndex?: number | null;
}
export function safeInputRecord(records: readonly SourceRecord[] | undefined): SourceRecord[] {
  return (records ?? []).map((record) => ({ ...record }));
}
export function classifyBrowserNetwork(value: boolean | null): Network {
  return value === null ? "UNKNOWN" : value ? "online" : "offline";
}
export function boundedMeasurement(value: number | null): number | null {
  return value === null || !Number.isFinite(value) || value < 0 ? null : value;
}
export async function observePage(page: Page, options: BrowserOptions): Promise<BrowserSnapshot> {
  const dom = await page.evaluate(() => {
    const visible = (node: HTMLElement): boolean => {
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && bounds.width > 0 && bounds.height > 0;
    };
    const name = (node: HTMLElement): string => {
      const aria = node.getAttribute("aria-label");
      if (aria?.trim()) return aria.trim();
      const ids = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
      const referenced = ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? "").filter(Boolean).join(" ");
      if (referenced.trim()) return referenced.trim();
      if (node instanceof HTMLInputElement && node.labels?.length) {
        const labels = [...node.labels].map((label) => label.textContent?.trim() ?? "").filter(Boolean).join(" ");
        if (labels) return labels;
      }
      if (node instanceof HTMLImageElement && node.alt.trim()) return node.alt.trim();
      if (node.getAttribute("title")?.trim()) return node.getAttribute("title")!.trim();
      return (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    };
    const focusables = [...document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type='hidden']),select,textarea,summary,[tabindex]",
    )];
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true'],dialog[open]");
    const targets = focusables.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const role = node.getAttribute("role") || node.tagName.toLowerCase();
      return {
        key: node.id || `control-${index}`,
        name: name(node) || null,
        role,
        visible: visible(node),
        disabled: node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true",
        inert: Boolean(node.closest("[inert]")),
        tabIndex: node.tabIndex,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        inDialog: Boolean(dialog?.contains(node)),
      };
    });
    const rect = active?.getBoundingClientRect();
    const focus = {
      key: active ? active.id || active.getAttribute("name") || active.tagName.toLowerCase() : null,
      name: active ? name(active) || null : null,
      role: active ? active.getAttribute("role") || active.tagName.toLowerCase() : null,
      visible: active ? visible(active) : null,
      inert: active ? Boolean(active.closest("[inert]")) : null,
      withinDialog: active ? Boolean(dialog?.contains(active)) : null,
      bounds: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
    };
    const announcements = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")]
      .filter(visible).map((node, index) => {
        const role = node.getAttribute("role");
        const live = node.getAttribute("aria-live");
        return {
          key: node.id || `announcement-${index}`,
          text: (node.textContent ?? "").trim().replace(/\s+/g, " "),
          kind: live === "off" ? "off" : live === "assertive" || role === "alert" ? "assertive" : "polite",
          busy: node.getAttribute("aria-busy") === "true",
        };
      });
    return {
      language: document.documentElement.lang,
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      mainCount: document.querySelectorAll("main,[role='main']").length,
      focus,
      targets,
      announcements,
      dialogOpen: Boolean(dialog),
      scrollY: window.scrollY,
      width: window.innerWidth,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      observedAt: performance.now(),
      missingControls: targets.filter((target) => target.visible && !target.disabled && !target.name).length,
    };
  });
  const parsed: Locale = dom.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  const focus: FocusRecord = dom.focus;
  const screen: Screen = {
    route: options.route,
    locale: parsed,
    network: options.network ?? "UNKNOWN",
    cache: options.cache ?? "UNKNOWN",
    outcome: options.outcome ?? "UNKNOWN",
    title: dom.title,
    heading: dom.heading,
    mainCount: dom.mainCount,
    historyIndex: options.historyIndex ?? null,
    scrollY: dom.scrollY,
    focus,
    dialogOpen: dom.dialogOpen,
    records: safeInputRecord(options.records),
    resources: [...(options.resources ?? [])],
    announcements: dom.announcements.map((item) => ({ ...item, kind: item.kind as "off" | "assertive" | "polite", language: parsed, at: null })),
  };
  return { screen, targets: dom.targets, documentLanguage: dom.language,
    viewportWidth: dom.width, horizontalOverflow: dom.overflow,
    observedAt: dom.observedAt, missingControls: dom.missingControls };
}
export function browserFindings(observation: BrowserSnapshot, expected: Locale): Finding[] {
  const failures: Finding[] = [];
  if (!observation.documentLanguage.toLowerCase().startsWith(expected)) failures.push(finding("browser-language-mismatch", observation.screen.route, observation.documentLanguage));
  if (observation.horizontalOverflow > 0) failures.push(finding("browser-horizontal-overflow", observation.screen.route, String(observation.horizontalOverflow)));
  if (observation.viewportWidth < 320) failures.push(finding("browser-viewport-too-small", observation.screen.route, String(observation.viewportWidth), "warning"));
  if (!Number.isFinite(observation.observedAt) || observation.observedAt < 0) failures.push(finding("browser-timestamp-invalid", observation.screen.route, "UNKNOWN"));
  if (observation.missingControls > 0) failures.push(finding("browser-names-missing", observation.screen.route, String(observation.missingControls)));
  failures.push(...screenFindings(observation.screen));
  failures.push(...targetProblems(observation.targets, observation.screen.route));
  return failures;
}
