import type { Page } from "@playwright/test";
import type { FocusState, Message, Screen, Evidence, Locale, Phase, Connection } from "./p20aa-journey-model";
import type { KeyStroke, Target } from "./p20aa-keyboard-policy";
/** Read-only DOM observation: never synthesize accessibility facts or write to storage. */
export interface BrowserObservation {
  screen: Screen;
  targets: Target[];
  language: string;
  horizontalOverflow: number;
  headCount: number;
  liveRegionCount: number;
  capturedAt: number;
}
export interface BrowserOptions {
  route: string;
  locale: Locale;
  phase?: Phase;
  connection?: Connection;
  actionTime?: number;
  historyIndex?: number;
  evidence?: readonly Evidence[];
}
export function boundedNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
export function safeDomId(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  return value.trim().slice(0, 200);
}
export async function observeBrowser(page: Page, options: BrowserOptions): Promise<BrowserObservation> {
  const dom = await page.evaluate(() => {
    const visible = (node: Element): boolean => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const label = (node: HTMLElement): string => {
      const aria = node.getAttribute("aria-label");
      if (aria?.trim()) return aria.trim();
      const labelled = node.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const fromIds = labelled.map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if (fromIds) return fromIds;
      if (node instanceof HTMLInputElement && node.labels?.length) {
        const fromLabels = [...node.labels].map((item) => item.textContent ?? "").join(" ").trim();
        if (fromLabels) return fromLabels;
      }
      if (node instanceof HTMLImageElement) return node.alt;
      return (node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
    };
    const role = (node: HTMLElement): string => {
      const explicit = node.getAttribute("role");
      if (explicit) return explicit;
      if (node instanceof HTMLButtonElement) return "button";
      if (node instanceof HTMLAnchorElement && node.hasAttribute("href")) return "link";
      if (node instanceof HTMLInputElement) return node.type === "checkbox" ? "checkbox" : "textbox";
      if (node instanceof HTMLSelectElement) return "combobox";
      return node.tagName.toLowerCase();
    };
    const focusables = [...document.querySelectorAll<HTMLElement>(
      "a[href],button,input:not([type='hidden']),select,textarea,summary,[tabindex]",
    )];
    const targets = focusables.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const computedTab = node.tabIndex;
      const isVisible = visible(node);
      const isDisabled = node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true";
      const inert = Boolean(node.closest("[inert]"));
      const focusRing = style.outlineStyle !== "none" && style.outlineWidth !== "0px" ||
        style.boxShadow !== "none" || style.borderStyle !== "none";
      const state = (name: string): boolean | null => {
        const value = node.getAttribute(name);
        if (value === "true") return true;
        if (value === "false") return false;
        return null;
      };
      return {
        id: node.id || `dom-index-${index}`,
        role: role(node),
        label: label(node),
        visible: isVisible,
        disabled: isDisabled,
        inert,
        tabindex: computedTab,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        focusRing,
        selected: state("aria-selected"),
        checked: state("aria-checked"),
        expanded: state("aria-expanded"),
        controls: (node.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean),
      };
    });
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeRect = active?.getBoundingClientRect();
    const modal = document.querySelector<HTMLElement>("[role='dialog'][aria-modal='true'],dialog[open]");
    const focus: FocusState = {
      id: active ? (active.id || active.getAttribute("name") || active.tagName.toLowerCase()) : null,
      role: active ? role(active) : null,
      visible: active ? visible(active) : false,
      insideModal: Boolean(active && modal?.contains(active)),
      inInertRegion: Boolean(active?.closest("[inert]")),
      width: activeRect?.width ?? null,
      height: activeRect?.height ?? null,
    };
    const announcements = [...document.querySelectorAll<HTMLElement>("[role='status'],[role='alert'],[aria-live]")];
    const messages = announcements.map((node, index) => ({
      key: node.id || `live-${index}`,
      text: node.textContent?.trim().replace(/\s+/g, " ") ?? "",
      politeness: node.getAttribute("aria-live") || (node.getAttribute("role") === "alert" ? "assertive" : "polite"),
      busy: node.getAttribute("aria-busy") === "true",
      visible: visible(node),
    })).filter((node) => node.visible);
    const heading = document.querySelector("h1");
    const query = document.querySelector<HTMLInputElement>("input[type='search'],[role='searchbox']")?.value ?? "";
    return {
      language: document.documentElement.lang,
      title: document.title,
      heading: heading?.textContent?.trim() ?? "",
      mainCount: document.querySelectorAll("main,[role='main']").length,
      focus,
      targets,
      messages,
      modalId: modal?.id ?? (modal ? "active-modal" : null),
      query,
      scrollY: window.scrollY,
      overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      headCount: document.querySelectorAll("h1").length,
      liveRegionCount: announcements.length,
      capturedAt: performance.now(),
    };
  });
  const locale: Locale = dom.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  const messages: Message[] = dom.messages.map((message) => ({
    key: message.key,
    text: message.text,
    locale,
    politeness: message.politeness === "assertive" ? "assertive" : message.politeness === "off" ? "off" : "polite",
    busy: message.busy,
    emittedAt: options.actionTime ?? 0,
  }));
  const screen: Screen = {
    route: options.route,
    locale,
    connection: options.connection ?? "unknown",
    phase: options.phase ?? "ready",
    title: dom.title,
    heading: dom.heading,
    mainCount: dom.mainCount,
    focus: dom.focus,
    evidence: [...(options.evidence ?? [])],
    messages,
    modalId: dom.modalId,
    query: dom.query,
    scrollY: dom.scrollY,
    historyIndex: options.historyIndex ?? 0,
    actionTime: options.actionTime ?? 0,
  };
  return {
    screen,
    targets: dom.targets,
    language: dom.language,
    horizontalOverflow: dom.overflow,
    headCount: dom.headCount,
    liveRegionCount: dom.liveRegionCount,
    capturedAt: dom.capturedAt,
  };
}
export async function observeKeyStroke(page: Page, key: string): Promise<KeyStroke> {
  const before = await page.evaluate(() => ({
    id: document.activeElement?.id || null,
    scroll: window.scrollY,
    at: performance.now(),
  }));
  await page.keyboard.press(key);
  const after = await page.evaluate(() => ({
    id: document.activeElement?.id || null,
    scroll: window.scrollY,
  }));
  const supported = ["Tab", "Shift+Tab", "Enter", "Space", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
  if (!supported.includes(key)) throw new RangeError(`Unsupported keyboard input: ${key}`);
  return {
    key: key as KeyStroke["key"],
    before: before.id,
    after: after.id,
    prevented: before.scroll === after.scroll && before.id !== after.id && key.startsWith("Arrow"),
    at: before.at,
    scrollBefore: before.scroll,
    scrollAfter: after.scroll,
  };
}
export function browserObservationFindings(observation: BrowserObservation, expectedLocale: Locale): string[] {
  const failures: string[] = [];
  if (!observation.language.toLowerCase().startsWith(expectedLocale)) failures.push("document-language-mismatch");
  if (observation.headCount !== 1) failures.push("heading-count");
  if (observation.horizontalOverflow > 0) failures.push("horizontal-overflow");
  if (observation.screen.mainCount !== 1) failures.push("main-count");
  if (!observation.screen.title.trim()) failures.push("document-title");
  if (!observation.screen.heading.trim()) failures.push("heading-empty");
  return failures;
}
