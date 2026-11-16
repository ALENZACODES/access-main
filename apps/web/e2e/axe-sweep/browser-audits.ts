import type { Page } from "@playwright/test";
import {
  localeFromLang,
  normalizeCrawlLinks,
  routeKey,
  type FocusStep,
  type Issue,
  type Locale,
  type RouteRecord,
  type TargetGeometry,
} from "./sweep-contracts";

export interface PageSnapshot {
  readonly record: RouteRecord | null;
  readonly links: readonly string[];
  readonly targets: readonly TargetGeometry[];
  readonly headings: readonly string[];
  readonly issues: readonly Issue[];
}

interface RawTarget {
  label: string;
  width: number;
  height: number;
  area: number;
  exemptInline: boolean;
}

/** Browser extraction does not insert elements or alter application state. */
export async function collectPageSnapshot(page: Page, origin: string): Promise<PageSnapshot> {
  const url = page.url();
  const raw = await page.evaluate(() => {
    const root = document.documentElement;
    const headings = [...document.querySelectorAll("h1")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.textContent?.trim() ?? "");
    const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((el) => el.href);
    const mainCount = [...document.querySelectorAll("main, [role='main']")]
      .filter((el) => el.getClientRects().length > 0).length;

    const elements = [...document.querySelectorAll<HTMLElement>(
      "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [tabindex]:not([tabindex='-1'])",
    )];
    const targets: RawTarget[] = [];
    for (const element of elements) {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (element.closest("[inert], [hidden], [aria-hidden='true']")) continue;
      if (element.getAttribute("aria-hidden") === "true") continue;
      if (element instanceof HTMLInputElement && element.type === "hidden") continue;
      const bounds = element.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) continue;
      const label = element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.textContent?.trim().slice(0, 60) ||
        element.id || element.tagName.toLowerCase();
      const inline = element.tagName.toLowerCase() === "a" &&
        style.display === "inline" &&
        element.closest("p, li, dd, dt") !== null;

      targets.push({
        label,
        width: bounds.width,
        height: bounds.height,
        area: bounds.width * bounds.height,
        exemptInline: inline,
      });
    }
    return {
      lang: root.getAttribute("lang"),
      title: document.title,
      headings,
      mainCount,
      links,
      targets,
      hasHorizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      viewport: root.clientWidth,
    };
  });

  const issues: Issue[] = [];
  const locale = localeFromLang(raw.lang);
  if (locale === null) {
    issues.push({ code: "html-lang", location: url, detail: raw.lang ?? "missing" });
  }
  if (raw.hasHorizontalOverflow && raw.viewport <= 320) {
    issues.push({
      code: "reflow-overflow",
      location: url,
      detail: `Horizontal overflow at ${raw.viewport}px`,
    });
  }
  const record: RouteRecord | null = locale === null ? null : {
    url,
    locale,
    key: routeKey(url),
    title: raw.title,
    mainCount: raw.mainCount,
    headingCount: raw.headings.length,
  };
  return {
    record,
    links: normalizeCrawlLinks(raw.links, url, origin),
    targets: raw.targets,
    headings: raw.headings,
    issues,
  };
}

export interface KeyboardResult {
  readonly steps: readonly FocusStep[];
  readonly issues: readonly Issue[];
  readonly escapeClosed: boolean | null;
}

/** Tab navigation works without guessing the application's component names. */
export async function auditKeyboard(page: Page, maxSteps = 24): Promise<KeyboardResult> {
  const issues: Issue[] = [];
  const steps: FocusStep[] = [];
  const url = page.url();
  await page.keyboard.press("Tab");
  for (let index = 0; index < maxSteps; index += 1) {
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        return { identifier: "document", inDocument: false, visible: false, disabled: false };
      }
      const style = getComputedStyle(active);
      const rect = active.getBoundingClientRect();
      const identifier = active.id || active.getAttribute("aria-label") ||
        active.getAttribute("name") || active.textContent?.trim().slice(0, 30) ||
        active.tagName.toLowerCase();
      return {
        identifier,
        inDocument: document.contains(active),
        visible: rect.width > 0 && rect.height > 0 &&
          style.visibility !== "hidden" && style.display !== "none",
        disabled: active.matches(":disabled, [aria-disabled='true']"),
      };
    });
    if (focus.identifier === "document") break;
    steps.push(focus);
    if (!focus.inDocument || !focus.visible || focus.disabled) {
      issues.push({ code: "keyboard-focus", location: url, detail: focus.identifier });
    }
    await page.keyboard.press("Tab");
  }

  // Escape should dismiss a dialog only if a modal is actually present.
  const modal = page.locator("[role='dialog'][aria-modal='true'], dialog[open]").first();
  let escapeClosed: boolean | null = null;
  if (await modal.count() > 0 && await modal.isVisible()) {
    await page.keyboard.press("Escape");
    escapeClosed = !(await modal.isVisible());
    if (!escapeClosed) {
      issues.push({ code: "escape-modal", location: url, detail: "Modal remains open" });
    }
  }
  return { steps, issues, escapeClosed };
}

export interface OfflineResult {
  readonly locale: Locale | null;
  readonly appShellPresent: boolean;
  readonly serviceWorkerControlled: boolean;
  readonly offlineMessagePresent: boolean;
  readonly title: string;
}

/** Read the offline document; do not fabricate a cached route. */
export async function inspectOfflinePage(page: Page): Promise<OfflineResult> {
  return page.evaluate(() => {
    const text = document.body?.innerText.toLowerCase() ?? "";
    const language = document.documentElement.lang.trim().toLowerCase().split("-")[0];
    return {
      locale: language === "en" || language === "fr" ? language : null,
      appShellPresent: document.querySelector("main, [role='main']") !== null,
      serviceWorkerControlled: navigator.serviceWorker?.controller !== null &&
        navigator.serviceWorker?.controller !== undefined,
      offlineMessagePresent: /offline|hors ligne|connexion|connection|unavailable|indisponible/i.test(text),
      title: document.title,
    };
  });
}

export interface LanguageSwitch {
  readonly href: string;
  readonly label: string;
  readonly hreflang: string | null;
}

export async function collectLanguageSwitches(page: Page): Promise<LanguageSwitch[]> {
  return page.locator("a[href][hreflang], link[rel='alternate'][hreflang]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: (node as HTMLAnchorElement | HTMLLinkElement).href,
      label: node.getAttribute("aria-label") ?? node.textContent?.trim() ?? "",
      hreflang: node.getAttribute("hreflang"),
    })),
  );
}

export function languageSwitchIssues(
  switches: readonly LanguageSwitch[],
  origin: string,
  location: string,
): Issue[] {
  return switches.flatMap((item) => {
    if (localeFromLang(item.hreflang) === null) return [];
    try {
      if (new URL(item.href).origin === origin) return [];
    } catch {
      // Invalid href is reported in the same branch as an external one.
    }
    return [{ code: "external-locale-switch", location, detail: item.href }];
  });
}
